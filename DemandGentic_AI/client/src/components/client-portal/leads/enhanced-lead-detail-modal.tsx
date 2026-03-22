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
  FileText, MessageSquare, Send, Trash2, Edit, Sparkles,
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
  hasRecording?: boolean;
  recordingS3Key?: string | null;
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
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingText, setEditingText] = useState('');

  const getToken = () => localStorage.getItem('clientPortalToken');

  // Fetch lead details
  const { data: lead, isLoading: leadLoading } = useQuery({
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
  const { data: comments = [], isLoading: commentsLoading } = useQuery({
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

  const hasAnyRecordingEvidence = Boolean(
    lead?.hasRecording ||
    lead?.recordingUrl ||
    lead?.recordingS3Key ||
    lead?.callSessionId,
  );

  return (
     !o && onClose()}>
      
        
          
            
            Lead Details
          
        

        {leadLoading ? (
          
            
          
        ) : !lead ? (
          
            Lead not found
          
        ) : (
          
            
              
                Overview
                Call Details
                
                  
                  Comments
                  {comments.length > 0 && (
                    
                      {comments.length}
                    
                  )}
                
              
            

            
              
                {/* Overview Tab */}
                
                  
                    {/* Contact Information */}
                    
                      
                        
                          
                          Contact Information
                        
                      
                      
                        
                          Name
                          {lead.contactName || 'Unknown'}
                        
                        {lead.contactTitle && (
                          
                            Title
                            {lead.contactTitle}
                          
                        )}
                        {lead.contactEmail && (
                          
                            
                            
                              {lead.contactEmail}
                            
                          
                        )}
                        {lead.contactPhone && (
                          
                            
                            
                              {lead.contactPhone}
                            
                          
                        )}
                        {lead.linkedinUrl && (
                          
                            
                            
                              View LinkedIn Profile
                            
                          
                        )}
                      
                    

                    {/* Company Information */}
                    
                      
                        
                          
                          Company Information
                        
                      
                      
                        
                          Company
                          {lead.accountName || '-'}
                        
                        {lead.accountIndustry && (
                          
                            Industry
                            
                              {lead.accountIndustry}
                            
                          
                        )}
                      
                    
                  

                  {/* Qualification Details */}
                  
                    
                      
                        
                        Qualification Details
                      
                    
                    
                      
                        
                          AI Score
                          {lead.aiScore || '-'}
                        
                        
                          Call Duration
                          {formatDuration(lead.callDuration)}
                        
                        
                          Status
                          
                            {lead.qaStatus || 'New'}
                          
                        
                        
                          Campaign
                          {lead.campaignName || '-'}
                        
                      

                      {lead.aiAnalysis && (
                        
                          
                            
                            AI Analysis
                          
                          
                            {JSON.stringify(lead.aiAnalysis, null, 2)}
                          
                        
                      )}
                    
                  
                

                {/* Call Details Tab */}
                
                  {lead.callSessionId && (
                    
                      
                    
                  )}

                  {hasAnyRecordingEvidence && (
                    
                  )}
                  
                  {lead.transcript && (
                    
                  )}

                  {!hasAnyRecordingEvidence && !lead.transcript && (
                    
                      
                        
                        No call details available
                      
                    
                  )}
                

                {/* Comments Tab */}
                
                  {/* Add Comment */}
                  
                    
                      
                        
                        Add Comment
                      
                      
                        Add notes or feedback about this lead
                      
                    
                    
                       setNewComment(e.target.value)}
                        rows={4}
                        className="resize-none"
                      />
                       addCommentMutation.mutate(newComment)}
                        disabled={!newComment.trim() || addCommentMutation.isPending}
                        className="w-full sm:w-auto bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                      >
                        {addCommentMutation.isPending ? (
                          <>
                            
                            Posting...
                          
                        ) : (
                          <>
                            
                            Post Comment
                          
                        )}
                      
                    
                  

                  {/* Comments List */}
                  
                    {commentsLoading ? (
                      
                        
                      
                    ) : comments.length === 0 ? (
                      
                        
                          
                          No comments yet
                          Be the first to add a comment!
                        
                      
                    ) : (
                      comments.map((comment) => (
                        
                          
                            
                              
                                
                                  {getInitials(comment.clientUserFirstName, comment.clientUserLastName)}
                                
                              
                              
                                
                                  
                                    
                                      {comment.clientUserFirstName && comment.clientUserLastName
                                        ? `${comment.clientUserFirstName} ${comment.clientUserLastName}`
                                        : comment.clientUserEmail || 'Unknown User'}
                                    
                                    
                                      {new Date(comment.createdAt).toLocaleString()}
                                    
                                  
                                  
                                     {
                                        setEditingCommentId(comment.id);
                                        setEditingText(comment.commentText);
                                      }}
                                    >
                                      
                                    
                                     deleteCommentMutation.mutate(comment.id)}
                                      disabled={deleteCommentMutation.isPending}
                                    >
                                      
                                    
                                  
                                

                                {editingCommentId === comment.id ? (
                                  
                                     setEditingText(e.target.value)}
                                      rows={3}
                                      className="resize-none"
                                    />
                                    
                                       
                                          updateCommentMutation.mutate({ 
                                            commentId: comment.id, 
                                            commentText: editingText 
                                          })
                                        }
                                        disabled={!editingText.trim() || updateCommentMutation.isPending}
                                      >
                                        Save
                                      
                                       {
                                          setEditingCommentId(null);
                                          setEditingText('');
                                        }}
                                      >
                                        Cancel
                                      
                                    
                                  
                                ) : (
                                  {comment.commentText}
                                )}
                              
                            
                          
                        
                      ))
                    )}
                  
                
              
            
          
        )}
      
    
  );
}