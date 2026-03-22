import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClientPortalLayout } from "@/components/client-portal/layout/client-portal-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  MessageSquareText,
  Loader2,
  Phone,
  Clock,
  Star,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lightbulb,
  BarChart3,
  Mic,
} from "lucide-react";

const getToken = () => localStorage.getItem('clientPortalToken');

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const getScoreColor = (score: number) => {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
};

const getScoreBarColor = (score: number) => {
  if (score >= 80) return '[&>div]:bg-green-500';
  if (score >= 60) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-red-500';
};

const getSentimentBadge = (sentiment: string | null) => {
  if (!sentiment) return null;
  const s = sentiment.toLowerCase();
  if (s === 'positive') return Positive;
  if (s === 'negative') return Negative;
  return Neutral;
};

interface Conversation {
  id: string;
  campaignId: string;
  campaignName: string;
  contactName: string;
  accountName: string;
  disposition: string;
  duration: number;
  qualityScore: number | null;
  qaStatus: string | null;
  transcript: string | null;
  analysis: any | null;
  createdAt: string;
  // Post-call quality dimensions
  engagementScore: number | null;
  clarityScore: number | null;
  empathyScore: number | null;
  objectionHandlingScore: number | null;
  qualificationScore: number | null;
  closingScore: number | null;
  flowComplianceScore: number | null;
  campaignAlignmentScore: number | null;
  sentiment: string | null;
  engagementLevel: string | null;
  issues: string[] | null;
  recommendations: string[] | null;
  hasRecording: boolean;
  recordingS3Key: string | null;
}

function QualityDimensionBar({ label, score }: { label: string; score: number | null }) {
  if (score === null || score === undefined) return null;
  const pct = Math.round(score);
  return (
    
      
        {label}
        {pct}%
      
      
    
  );
}

function hasAnyQualityDimension(conv: Conversation): boolean {
  return [
    conv.engagementScore, conv.clarityScore, conv.empathyScore,
    conv.objectionHandlingScore, conv.qualificationScore, conv.closingScore,
    conv.flowComplianceScore, conv.campaignAlignmentScore,
  ].some(s => s !== null && s !== undefined);
}

export default function ClientPortalConversationQuality() {
  const [selectedCampaign, setSelectedCampaign] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  // Fetch campaigns
  const { data: campaignsData } = useQuery({
    queryKey: ['client-portal-campaigns-for-quality'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/campaigns', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch campaigns');
      return res.json();
    },
  });

  const campaigns = [
    ...(campaignsData?.verificationCampaigns || []),
    ...(campaignsData?.regularCampaigns || []),
  ];

  // Fetch conversations
  const { data: conversations = [], isLoading } = useQuery({
    queryKey: ['client-portal-conversations', selectedCampaign],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCampaign !== 'all') params.append('campaignId', selectedCampaign);
      const res = await fetch(`/api/client-portal/conversations?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch conversations');
      return res.json();
    },
  });

  const avgQuality = conversations.length > 0
    ? Math.round(conversations.reduce((sum, c) => sum + (c.qualityScore || 0), 0) / (conversations.filter(c => c.qualityScore).length || 1))
    : 0;

  const qaApproved = conversations.filter(c => c.qaStatus === 'approved').length;
  const qaRejected = conversations.filter(c => c.qaStatus === 'rejected').length;

  return (
    
      
        {/* Header */}
        
          
          
            
              
                
              
              Conversation Quality
            
            Review call transcripts, quality scores, and AI-powered analysis
          
        

        {/* Filter */}
        
          
            
              Campaign
              
                
                  
                
                
                  All Campaigns
                  {campaigns.map((c: any) => (
                    {c.name}
                  ))}
                
              
            
          
        

        {isLoading ? (
          
            
          
        ) : (
          <>
            {/* Summary Stats */}
            
              
                
                  Total Conversations
                  
                
                
                  {conversations.length}
                
              
              
                
                  Avg Quality Score
                  
                
                
                  {avgQuality}%
                
              
              
                
                  QA Approved
                  
                
                
                  {qaApproved}
                
              
              
                
                  QA Rejected
                  
                
                
                  {qaRejected}
                
              
            

            {/* Conversations List */}
            
              
                Conversations
                Click on a row to view quality analysis and transcript
              
              
                {conversations.length === 0 ? (
                  
                    
                    No Conversations Yet
                    
                      Conversation quality data will appear once calls are made.
                    
                  
                ) : (
                  
                    {conversations.map((conv) => (
                      
                        {/* Row header */}
                         setExpandedId(expandedId === conv.id ? null : conv.id)}
                        >
                          
                            
                              {conv.contactName}
                              {conv.accountName} - {conv.campaignName}
                            
                          
                          
                            
                              {conv.disposition?.replace(/_/g, ' ') || 'N/A'}
                            
                            {conv.qualityScore !== null && (
                              = 70 ? 'default' : 'destructive'}>
                                {conv.qualityScore}%
                              
                            )}
                            {conv.qaStatus && (
                              
                                {conv.qaStatus}
                              
                            )}
                            {conv.hasRecording && (
                              
                            )}
                            
                              
                              {formatDuration(conv.duration || 0)}
                            
                            
                              {new Date(conv.createdAt).toLocaleDateString()}
                            
                            {expandedId === conv.id ? (
                              
                            ) : (
                              
                            )}
                          
                        

                        {/* Expanded content */}
                        {expandedId === conv.id && (
                          
                            {hasAnyQualityDimension(conv) || conv.sentiment || conv.issues?.length || conv.recommendations?.length ? (
                              
                                
                                  
                                    
                                      
                                      Analysis
                                    
                                    
                                      
                                      Transcript
                                    
                                  
                                

                                {/* Analysis Tab */}
                                
                                  
                                    {/* Overall Score + Sentiment */}
                                    
                                      {conv.qualityScore !== null && (
                                        
                                          Overall:
                                          
                                            {conv.qualityScore}%
                                          
                                        
                                      )}
                                      {getSentimentBadge(conv.sentiment)}
                                      {conv.engagementLevel && (
                                        
                                          {conv.engagementLevel} Engagement
                                        
                                      )}
                                    

                                    {/* Quality Dimensions */}
                                    {hasAnyQualityDimension(conv) && (
                                      
                                        Quality Dimensions
                                        
                                          
                                          
                                          
                                          
                                          
                                          
                                          
                                          
                                        
                                      
                                    )}

                                    {/* Issues */}
                                    {conv.issues && conv.issues.length > 0 && (
                                      
                                        
                                          
                                          Issues Identified
                                        
                                        
                                          {conv.issues.map((issue, i) => (
                                            
                                              &#8226;
                                              {issue}
                                            
                                          ))}
                                        
                                      
                                    )}

                                    {/* Recommendations */}
                                    {conv.recommendations && conv.recommendations.length > 0 && (
                                      
                                        
                                          
                                          Recommendations
                                        
                                        
                                          {conv.recommendations.map((rec, i) => (
                                            
                                              &#8226;
                                              {rec}
                                            
                                          ))}
                                        
                                      
                                    )}

                                    {/* Fallback to legacy analysis if no quality dimensions */}
                                    {!hasAnyQualityDimension(conv) && conv.analysis && (
                                      
                                        {conv.analysis.identityConfirmation !== undefined && (
                                          
                                            Identity Confirmation
                                            {conv.analysis.identityConfirmation ? 'Yes' : 'No'}
                                          
                                        )}
                                        {conv.analysis.pitchDelivery !== undefined && (
                                          
                                            Pitch Delivery
                                            {conv.analysis.pitchDelivery}/10
                                          
                                        )}
                                        {conv.analysis.objectionHandling !== undefined && (
                                          
                                            Objection Handling
                                            {conv.analysis.objectionHandling}/10
                                          
                                        )}
                                        {conv.analysis.closingAttempt !== undefined && (
                                          
                                            Closing Attempt
                                            {conv.analysis.closingAttempt ? 'Yes' : 'No'}
                                          
                                        )}
                                      
                                    )}
                                  
                                

                                {/* Transcript Tab */}
                                
                                  {conv.transcript ? (
                                    
                                      
                                        {conv.transcript}
                                      
                                    
                                  ) : (
                                    No transcript available
                                  )}
                                
                              
                            ) : (
                              /* No analysis data — just show transcript */
                              
                                {conv.transcript ? (
                                  
                                    
                                      {conv.transcript}
                                    
                                  
                                ) : (
                                  No transcript available
                                )}
                              
                            )}
                          
                        )}
                      
                    ))}
                  
                )}
              
            
          
        )}
      
    
  );
}