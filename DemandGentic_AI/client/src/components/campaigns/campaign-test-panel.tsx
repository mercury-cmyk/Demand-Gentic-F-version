import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { TranscriptViewer } from "@/components/client-portal/leads";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Phone,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  MessageSquare,
  BarChart3,
  Lightbulb,
  RefreshCw,
  User,
  Building2,
  Briefcase,
  Mail,
  Mic,
  Sparkles,
  ExternalLink,
} from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";
import { Link } from "wouter";

interface TestCall {
  id: string;
  campaignId: string;
  virtualAgentId: string | null;
  testPhoneNumber: string;
  testContactName: string;
  testCompanyName: string | null;
  testJobTitle: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  initiatedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  durationSeconds: number | null;
  disposition: string | null;
  testResult: string | null;
  callSummary: string | null;
  fullTranscript?: string | null;
  transcriptTurns?: Array | null;
  aiPerformanceMetrics: any;
  detectedIssues: any[] | null;
  recordingUrl: string | null;
  createdAt: string;
  agentName?: string | null;
}

interface TestCallSummary {
  stats: {
    total: number;
    completed: number;
    successful: number;
    needsImprovement: number;
    failed: number;
    avgDuration: number | null;
  };
  commonIssues: { type: string; count: number }[];
}

interface CampaignTestPanelProps {
  campaignId: string;
  campaignName: string;
  dialMode?: string;
  /** Hide the Preview Studio button (for client portal use) */
  hidePreviewStudio?: boolean;
}

function normalizePhoneToE164(phone: string | null, country: string = 'US'): string | null {
  if (!phone) return null;

  let cleanedPhone = phone.trim();

  if (cleanedPhone.match(/^\+440\d{10,}$/)) {
    cleanedPhone = '+44' + cleanedPhone.substring(4);
  }

  try {
    const phoneNumber = parsePhoneNumberFromString(cleanedPhone, country as any);
    if (phoneNumber && phoneNumber.isValid()) {
      return phoneNumber.number;
    }
  } catch {
    return null;
  }

  return null;
}

export function CampaignTestPanel({ campaignId, campaignName, dialMode, hidePreviewStudio }: CampaignTestPanelProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isTestDialogOpen, setIsTestDialogOpen] = useState(false);
  const [selectedTestCall, setSelectedTestCall] = useState(null);
  const [callState, setCallState] = useState('idle');
  const [testFormData, setTestFormData] = useState({
    testPhoneNumber: "",
    testContactName: "Zahid Mohammadi",
    testCompanyName: "Pivotal B2B",
    testJobTitle: "Founder",
    testContactEmail: "zahid@pivotal-b2b.com",
    voiceProvider: "openai" as "openai" | "google",
  });

  const showLoggedTests = true;

  // Fetch test calls for this campaign
  const { data: testCallsData, isLoading: testCallsLoading } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}/test-calls`],
    enabled: dialMode === "ai_agent" && showLoggedTests,
  });

  // Fetch test calls summary
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}/test-calls-summary`],
    enabled: dialMode === "ai_agent" && showLoggedTests,
  });

  // Fetch full details (including transcript) for the selected test call
  const { data: selectedTestCallDetails, isLoading: selectedTestCallDetailsLoading } = useQuery({
    queryKey: [`/api/campaigns/${campaignId}/test-calls/${selectedTestCall?.id}`],
    enabled: !!selectedTestCall?.id,
  });

  const activeSelectedTestCall = selectedTestCallDetails || selectedTestCall;
  const activeTranscriptText =
    activeSelectedTestCall?.fullTranscript ||
    (activeSelectedTestCall?.transcriptTurns && activeSelectedTestCall.transcriptTurns.length > 0
      ? activeSelectedTestCall.transcriptTurns
          .map((t) => `${t.role === "agent" || t.role === "assistant" ? "Agent" : "Contact"}: ${t.text}`)
          .join("\n")
      : null);
  const activeStructuredTranscript = activeSelectedTestCall?.transcriptTurns
    ? activeSelectedTestCall.transcriptTurns.map((t) => ({
        speaker: t.role === "agent" || t.role === "assistant" ? "Agent" : "Contact",
        text: t.text,
        timestamp: t.timestamp,
      }))
    : null;

  // Analyze test call mutation
  const analyzeTestMutation = useMutation({
    mutationFn: async (testCallId: string) => {
      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/test-calls/${testCallId}/analyze`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Analysis Complete",
        description: `Test result: ${data.analysis?.testResult || 'Unknown'}`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/test-calls`] });
    },
    onError: (error: Error) => {
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Initiate test call via server-side API (no browser SIP needed)
  const initiateTestMutation = useMutation({
    mutationFn: async () => {
      const normalizedPhone = normalizePhoneToE164(testFormData.testPhoneNumber);
      if (!normalizedPhone) {
        throw new Error("Invalid phone number format");
      }
      
      const response = await apiRequest("POST", `/api/campaigns/${campaignId}/test-call`, {
        testPhoneNumber: normalizedPhone,
        testContactName: testFormData.testContactName,
        testCompanyName: testFormData.testCompanyName || undefined,
        testJobTitle: testFormData.testJobTitle || undefined,
        testContactEmail: testFormData.testContactEmail || undefined,
        voiceProvider: testFormData.voiceProvider,
      });
      return response.json();
    },
    onMutate: () => {
      setCallState('initiating');
    },
    onSuccess: () => {
      setCallState('idle');
      setIsTestDialogOpen(false);
      toast({
        title: "Test Call Started",
        description: `Calling ${testFormData.testPhoneNumber} via AI agent...`,
      });
      queryClient.invalidateQueries({ queryKey: [`/api/campaigns/${campaignId}/test-calls`] });
    },
    onError: (error: Error) => {
      setCallState('idle');
      toast({
        title: "Test Call Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleInitiateTest = () => {
    if (!testFormData.testPhoneNumber || !testFormData.testContactName) {
      toast({
        title: "Missing Required Fields",
        description: "Phone number and contact name are required",
        variant: "destructive",
      });
      return;
    }

    const normalizedPhone = normalizePhoneToE164(testFormData.testPhoneNumber);
    if (!normalizedPhone) {
      toast({
        title: "Invalid phone number",
        description: "Enter a valid phone number in E.164 format (e.g., +14155552671).",
        variant: "destructive",
      });
      return;
    }

    initiateTestMutation.mutate();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return Completed;
      case 'in_progress':
        return In Progress;
      case 'pending':
        return Pending;
      case 'failed':
        return Failed;
      default:
        return {status};
    }
  };

  const getResultBadge = (result: string | null) => {
    switch (result) {
      case 'success':
        return Success;
      case 'needs_improvement':
        return Needs Improvement;
      case 'failed':
        return Failed;
      default:
        return Not Analyzed;
    }
  };

  // Don't show for non-AI campaigns
  if (dialMode !== "ai_agent") {
    return null;
  }

  return (
    
      
        
          
            
              
              AI Test Calls
            
            
              Preview Studio is for AI simulation. Test calls use server-side dialing.
            
          
          
            {!hidePreviewStudio && (
              
                
                  
                  Preview Studio
                  
                
              
            )}
            
              
                
                  
                  New Test Call
                
              
            
              
                Initiate Test Call
                
                  Use server-side dialing to validate call flow. AI prompt rehearsal happens in Preview Studio.
                
              
              
                
                  
                    
                    Phone Number *
                  
                   setTestFormData(prev => ({ ...prev, testPhoneNumber: e.target.value }))}
                    data-testid="input-test-phone"
                  />
                
                
                  
                    
                    Contact Name *
                  
                   setTestFormData(prev => ({ ...prev, testContactName: e.target.value }))}
                    data-testid="input-test-name"
                  />
                
                
                  
                    
                    Company Name
                  
                   setTestFormData(prev => ({ ...prev, testCompanyName: e.target.value }))}
                    data-testid="input-test-company"
                  />
                
                
                  
                    
                    Job Title
                  
                   setTestFormData(prev => ({ ...prev, testJobTitle: e.target.value }))}
                    data-testid="input-test-title"
                  />
                
                
                  
                    
                    Email (Optional)
                  
                   setTestFormData(prev => ({ ...prev, testContactEmail: e.target.value }))}
                    data-testid="input-test-email"
                  />
                
                
                  
                    
                    Voice Provider
                  
                  
                      setTestFormData(prev => ({ ...prev, voiceProvider: value }))
                    }
                  >
                    
                      
                    
                    
                      OpenAI Realtime
                      Google Gemini
                    
                  
                  
                    OpenAI Realtime offers natural conversation. Gemini is faster and more cost-effective.
                  
                
              
              
                
                  Call state
                  {callState}
                
              
              
                 setIsTestDialogOpen(false)}
                  data-testid="button-cancel-test"
                >
                  Cancel
                
                
                  
                  {callState === 'initiating' ? "Starting..." : "Start Test Call"}
                
              
            
            
          
        
      
      
        {/* Summary Stats */}
        {showLoggedTests && summaryLoading ? (
          
            {[1, 2, 3, 4, 5].map((i) => (
              
            ))}
          
        ) : showLoggedTests && summary ? (
          
            
              {summary.stats.total}
              Total Tests
            
            
              {summary.stats.successful}
              Successful
            
            
              {summary.stats.needsImprovement}
              Needs Work
            
            
              {summary.stats.failed}
              Failed
            
            
              
                {summary.stats.avgDuration ? `${Math.round(summary.stats.avgDuration)}s` : '-'}
              
              Avg Duration
            
          
        ) : null}

        {/* Common Issues */}
        {showLoggedTests && summary?.commonIssues && summary.commonIssues.length > 0 && (
          
            
              
              Common Issues Detected
            
            
              {summary.commonIssues.map((issue, idx) => (
                
                  {issue.type} ({issue.count})
                
              ))}
            
          
        )}

        {/* Test Calls Table */}
        {showLoggedTests ? (
          testCallsLoading ? (
            
          ) : testCallsData?.testCalls && testCallsData.testCalls.length > 0 ? (
            
              
                
                  
                    Contact
                    Phone
                    Status
                    Result
                    Duration
                    Date
                    Actions
                  
                
                
                  {testCallsData.testCalls.map((testCall) => (
                    
                      
                        
                          {testCall.testContactName}
                          {testCall.testCompanyName && (
                            {testCall.testCompanyName}
                          )}
                        
                      
                      {testCall.testPhoneNumber}
                      {getStatusBadge(testCall.status)}
                      {getResultBadge(testCall.testResult)}
                      
                        {testCall.durationSeconds ? `${testCall.durationSeconds}s` : '-'}
                      
                      
                        {formatDistanceToNow(new Date(testCall.createdAt), { addSuffix: true })}
                      
                      
                        
                          {testCall.status === 'completed' && !testCall.testResult && (
                             analyzeTestMutation.mutate(testCall.id)}
                              disabled={analyzeTestMutation.isPending}
                            >
                              {analyzeTestMutation.isPending ? (
                                
                              ) : (
                                
                              )}
                            
                          )}
                           setSelectedTestCall(testCall)}
                          >
                            
                          
                        
                      
                    
                  ))}
                
              
            
          ) : (
            
              
              No test calls yet
              Run a test call to validate your AI agent before launching
            
          )
        ) : null}

        {/* Test Call Details Dialog */}
         setSelectedTestCall(null)}>
          
            {selectedTestCall && (
              <>
                
                  
                    
                    Test Call Details
                  
                  
                    {selectedTestCall.testContactName} at {selectedTestCall.testCompanyName || 'Unknown Company'}
                  
                

                
                  {/* Basic Info */}
                  
                    
                      Status
                      {getStatusBadge(selectedTestCall.status)}
                    
                    
                      Result
                      {getResultBadge(selectedTestCall.testResult)}
                    
                    
                      Duration
                      
                        {selectedTestCall.durationSeconds ? `${selectedTestCall.durationSeconds} seconds` : 'N/A'}
                      
                    
                    
                      Disposition
                      
                        {selectedTestCall.disposition?.replace(/_/g, ' ') || 'N/A'}
                      
                    
                  

                  {/* Call Summary */}
                  {selectedTestCall.callSummary && (
                    
                      Call Summary
                      
                        {selectedTestCall.callSummary}
                      
                    
                  )}

                  {/* Transcript */}
                  
                    Transcript
                    
                      {selectedTestCallDetailsLoading ? (
                        
                      ) : activeTranscriptText ? (
                        
                      ) : (
                        No transcript available
                      )}
                    
                  

                  {/* Performance Metrics */}
                  {selectedTestCall.aiPerformanceMetrics && (
                    
                      
                        
                          
                            
                            Performance Metrics
                          
                        
                        
                          
                            {Object.entries(selectedTestCall.aiPerformanceMetrics).map(([key, value]) => (
                              
                                {key.replace(/([A-Z])/g, ' $1').trim()}
                                
                                  {typeof value === 'boolean' ? (value ? '✓' : '✗') : String(value)}
                                
                              
                            ))}
                          
                        
                      
                    
                  )}

                  {/* Detected Issues */}
                  {selectedTestCall.detectedIssues && selectedTestCall.detectedIssues.length > 0 && (
                    
                      
                        
                          
                            
                            Detected Issues ({selectedTestCall.detectedIssues.length})
                          
                        
                        
                          
                            {selectedTestCall.detectedIssues.map((issue: any, idx: number) => (
                              
                                
                                  
                                    {issue.severity}
                                  
                                  
                                    {issue.type}
                                    {issue.description}
                                    {issue.suggestion && (
                                      
                                        
                                        {issue.suggestion}
                                      
                                    )}
                                  
                                
                              
                            ))}
                          
                        
                      
                    
                  )}

                  {/* Recording */}
                  {selectedTestCall.recordingUrl && (
                    
                      Recording
                      
                         window.open(selectedTestCall.recordingUrl!, '_blank', 'noopener,noreferrer')}
                        >
                           Play in New Tab
                        
                      
                    
                  )}
                

                
                  {selectedTestCall.status === 'completed' && !selectedTestCall.testResult && (
                     {
                        analyzeTestMutation.mutate(selectedTestCall.id);
                        setSelectedTestCall(null);
                      }}
                      disabled={analyzeTestMutation.isPending}
                    >
                      
                      Analyze Call
                    
                  )}
                   setSelectedTestCall(null)}>
                    Close
                  
                
              
            )}
          
        
      
    
  );
}