import { useQuery } from '@tanstack/react-query';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Loader2, User, Building2, Mail, Phone, Linkedin,
  Clock, Calendar, Target, FileText, Headphones, Copy, ExternalLink,
  CheckCircle, AlertCircle, Star,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { TranscriptViewer } from './transcript-viewer';
import { RecordingPlayer } from './recording-player';
import { PushToShowcaseButton } from '@/components/showcase-calls/push-to-showcase-button';

interface LeadDetail {
  id: string;
  callSessionId?: string | null;
  hasRecording?: boolean;
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

interface LeadDetailModalProps {
  leadId: string | null;
  open: boolean;
  onClose: () => void;
}

export function LeadDetailModal({ leadId, open, onClose }: LeadDetailModalProps) {
  const { toast } = useToast();
  const getToken = () => localStorage.getItem('clientPortalToken');

  const { data: lead, isLoading, error } = useQuery({
    queryKey: ['client-portal-lead-detail', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/client-portal/qualified-leads/${leadId}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch lead details');
      return res.json();
    },
    enabled: !!leadId && open,
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return '-';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return 'text-gray-500';
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getQualificationBadge = (status: string | null) => {
    switch (status?.toLowerCase()) {
      case 'qualified':
        return  Qualified;
      case 'not_qualified':
        return  Not Qualified;
      case 'needs_review':
        return Needs Review;
      default:
        return {status || 'Unknown'};
    }
  };

  return (
     !o && onClose()}>
      
        
          
            
            Lead Details
          
          
            Complete information about this qualified lead
          
        

        {isLoading ? (
          
            
          
        ) : error || !lead ? (
          
            
            Failed to load lead details
          
        ) : (
          
            
              
                Overview
                
                  
                  Transcript
                
                
                  
                  Recording
                
              

              
                
                  {/* Contact & Company Info */}
                  
                    
                      
                        
                          
                          Contact Information
                        
                      
                      
                        
                          
                            {lead.contactName || 'Unknown'}
                            {lead.contactTitle && (
                              {lead.contactTitle}
                            )}
                          
                        

                        {lead.contactEmail && (
                          
                            
                            {lead.contactEmail}
                             copyToClipboard(lead.contactEmail!, 'Email')}
                            >
                              
                            
                          
                        )}

                        {lead.contactPhone && (
                          
                            
                            {lead.contactPhone}
                             copyToClipboard(lead.contactPhone!, 'Phone')}
                            >
                              
                            
                          
                        )}

                        {lead.dialedNumber && (
                          
                            
                            
                              Dialed: {lead.dialedNumber}
                            
                          
                        )}

                        {lead.linkedinUrl && (
                          
                            
                            
                              LinkedIn Profile
                              
                            
                          
                        )}
                      
                    

                    
                      
                        
                          
                          Company Information
                        
                      
                      
                        
                          {lead.accountName || 'Unknown'}
                          {lead.accountIndustry && (
                            {lead.accountIndustry}
                          )}
                        

                        

                        
                          
                          Campaign: {lead.campaignName || '-'}
                        
                      
                    
                  

                  {/* Call & QA Info */}
                  
                    
                      
                        
                          
                          Call Details
                        
                      
                      
                        
                          
                            
                            Duration
                          
                          {formatDuration(lead.callDuration)}
                        

                        
                          
                            
                            Transcript
                          
                          {lead.transcript ? (
                            Available
                          ) : (
                            Not Available
                          )}
                        

                        
                          
                            
                            Recording
                          
                          {lead.hasRecording ? (
                            Available
                          ) : (
                            Not Available
                          )}
                        

                        

                        {lead.callSessionId && (
                          
                        )}

                        
                          
                            
                            Created
                          
                          
                            {lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '-'}
                          
                        

                        {lead.approvedAt && (
                          
                            
                              
                              Approved
                            
                            
                              {new Date(lead.approvedAt).toLocaleDateString()}
                            
                          
                        )}
                      
                    

                    
                      
                        
                          
                          AI Analysis
                        
                      
                      
                        
                          AI Score
                          
                            {lead.aiScore ? lead.aiScore.toFixed(0) : '-'}
                          
                        

                        
                          Qualification Status
                          {getQualificationBadge(lead.aiQualificationStatus)}
                        

                        {lead.aiAnalysis && (
                          <>
                            
                            
                              AI Summary
                              
                                {typeof lead.aiAnalysis === 'string'
                                  ? lead.aiAnalysis
                                  : lead.aiAnalysis.summary || lead.aiAnalysis.analysis || 'No summary available'}
                              
                            
                          
                        )}

                        {lead.qaData && lead.qaData.key_points && (
                          <>
                            
                            
                              Key Points
                              
                                {lead.qaData.key_points.slice(0, 5).map((point: string, i: number) => (
                                  
                                    •
                                    {point}
                                  
                                ))}
                              
                            
                          
                        )}
                      
                    
                  

                  {/* Notes */}
                  {lead.notes && (
                    
                      
                        Notes
                      
                      
                        {lead.notes}
                      
                    
                  )}
                

                
                  {lead.transcript && (
                    
                  )}
                

                
                  {lead.hasRecording && (
                    
                  )}
                
              
            
          
        )}
      
    
  );
}