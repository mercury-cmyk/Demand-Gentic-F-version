import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { normalizeLegacyEmailStatus } from "@/lib/email-status";
import { 
  ArrowLeft, 
  Building2, 
  User, 
  Phone, 
  Mail, 
  Calendar, 
  Briefcase,
  Download, 
  Play,
  CheckCircle, 
  XCircle,
  Sparkles,
  FileText,
  Users,
  TrendingUp,
  RefreshCw,
  MapPin,
  Globe,
  DollarSign,
  Linkedin,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Loader2
} from "lucide-react";
import { useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function LeadDetailPage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState("");

  const { data: lead, isLoading, isError, error } = useQuery({
    queryKey: ['/api/leads', id],
    enabled: !!id,
  });

  // Fetch all leads for navigation
  const { data: allLeads } = useQuery({
    queryKey: ['/api/leads'],
  });

  // Find current lead index and get previous/next IDs
  const currentIndex = allLeads?.findIndex((l: any) => l.id === id) ?? -1;
  const previousLeadId = currentIndex > 0 ? allLeads?.[currentIndex - 1]?.id : null;
  const nextLeadId = currentIndex >= 0 && currentIndex  {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }
      return await apiRequest('POST', `/api/leads/${id}/approve`, { 
        approvedById: user.id,
        bypassQualityCheck
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads', id] });
      setBypassQualityCheck(false); // Reset bypass flag
      toast({
        title: "Success",
        description: "Lead approved and moved to approved section",
      });
    },
    onError: (error: any) => {
      // Check if error is due to quality requirements
      if (error.errors && error.canBypass) {
        toast({
          title: "Quality Requirements Not Met",
          description: `${error.message}\n\nMissing: ${error.errors.join(', ')}\n\nClick approve again to bypass.`,
          variant: "default",
        });
        setBypassQualityCheck(true); // Set bypass for next attempt
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to approve lead",
          variant: "destructive",
        });
      }
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (reason: string) => {
      return await apiRequest('POST', `/api/leads/${id}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads', id] });
      setRejectDialogOpen(false);
      setRejectReason("");
      toast({
        title: "Success",
        description: "Lead rejected",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('DELETE', `/api/leads/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      toast({
        title: "Success",
        description: "Lead deleted successfully",
      });
      navigate('/leads');
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete lead",
        variant: "destructive",
      });
    },
  });

  const transcribeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/leads/${id}/transcribe`, {});
    },
    onSuccess: () => {
      toast({
        title: "Transcription Started",
        description: "Call transcription is being processed. This may take a few minutes.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/leads', id] });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/leads/${id}/analyze`, {});
    },
    onSuccess: () => {
      toast({
        title: "AI Analysis Complete",
        description: "Lead qualification analysis has been completed.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/leads', id] });
    },
  });

  const fetchRecordingMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', `/api/leads/${id}/fetch-recording`, {});
    },
    onSuccess: () => {
      toast({
        title: "Recording Fetch Started",
        description: "Fetching call recording from Telnyx. This may take a moment.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/leads', id] });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to fetch recording",
      });
    },
  });

  const validateCompanyMutation = useMutation({
    mutationFn: async (force: boolean = false) => {
      return await apiRequest('POST', `/api/leads/${id}/validate-company`, { force });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads', id] });
      toast({
        title: "Company Validated",
        description: "Company information has been validated with Companies House",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Validation Failed",
        description: error.message || "Failed to validate company",
      });
    },
  });

  const validateEmailMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', `/api/leads/${id}/validate-email`, {});
      return await response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads', id] });
      
      // Debug: log the response
      console.log('[EMAIL-VALIDATION] Response data:', data);
      
      // Safety check: ensure validation data exists
      if (!data || !data.validation) {
        console.error('[EMAIL-VALIDATION] Invalid data structure:', data);
        toast({
          variant: "destructive",
          title: "Email Validation Failed",
          description: "Invalid response from server",
        });
        return;
      }
      
      const validation = data.validation;
      const normalizedStatus = normalizeLegacyEmailStatus(validation.status);
      const isDeliverable = normalizedStatus === 'valid';
      const isAcceptable = normalizedStatus === 'acceptable';
      const isInvalid = normalizedStatus === 'invalid';
      
      toast({
        title: isDeliverable ? "Email Valid ✓" : isInvalid ? "Email Invalid" : isAcceptable ? "Email Acceptable" : "Email Validation Complete",
        description: `Status: ${normalizedStatus}${validation.smtpAccepted !== null ? ` | SMTP: ${validation.smtpAccepted ? 'Accepted' : 'Rejected'}` : ''} | Confidence: ${validation.confidence}%`,
        variant: isDeliverable ? "default" : isInvalid ? "destructive" : "default",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Email Validation Failed",
        description: error.message || "Failed to validate email",
      });
    },
  });

  const updateNotesMutation = useMutation({
    mutationFn: async (notes: string) => {
      return await apiRequest('PATCH', `/api/leads/${id}`, { notes });
    },
    onSuccess: () => {
      toast({
        title: "Notes Saved",
        description: "Lead notes have been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/leads', id] });
      setEditingNotes(false);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to save notes",
      });
    },
  });

  const [isLoadingGcsUrl, setIsLoadingGcsUrl] = useState(false);

  const openRecordingInNewTab = async () => {
    setIsLoadingGcsUrl(true);
    try {
      const res = await apiRequest('GET', `/api/recordings/${id}/gcs-url`);
      if (!res.ok) throw new Error('Failed to get recording URL');
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        toast({
          title: "No Recording",
          description: "No recording URL available.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to get recording URL",
        variant: "destructive",
      });
    } finally {
      setIsLoadingGcsUrl(false);
    }
  };

  const handleDownload = async () => {
    await openRecordingInNewTab();
    toast({
      title: "Download Started",
      description: "Call recording opened in new tab for download.",
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = (status: string) => {
    const config: Record = {
      new: { variant: "secondary", label: "New" },
      under_review: { variant: "default", label: "Under Review" },
      approved: { variant: "outline", label: "Approved" },
      rejected: { variant: "destructive", label: "Rejected" },
      published: { variant: "outline", label: "Published" },
    };
    const { variant, label } = config[status] || config.new;
    return {label};
  };

  const getQualificationBadge = (status: string) => {
    if (status === 'qualified') return Qualified;
    if (status === 'not_qualified') return Not Qualified;
    return Needs Review;
  };

  if (isLoading) {
    return (
      
        
          
          
            
            
          
        
        
          
          
          
        
      
    );
  }

  if (isError) {
    const message = error instanceof Error ? error.message : "Failed to load lead details.";
    const isRateLimited = message.includes("429");
    const isAuthIssue = message.includes("401") || message.toLowerCase().includes("session expired");

    return (
      
        
        
          {isRateLimited ? "Rate Limited" : isAuthIssue ? "Authentication Required" : "Lead Load Failed"}
        
        
          {isRateLimited
            ? "Too many API requests right now. Please wait a moment and refresh."
            : isAuthIssue
              ? "Your session has expired or is invalid. Please log in again."
              : message}
        
         navigate('/leads')} className="mt-4" data-testid="button-back-to-leads-on-error">
          Back to Leads
        
      
    );
  }

  if (!lead) {
    return (
      
        
        Lead Not Found
        The lead you're looking for doesn't exist.
         navigate('/leads')} className="mt-4" data-testid="button-back-to-leads">
          Back to Leads
        
      
    );
  }

  // Check if user has admin or quality_analyst role (support multi-role system)
  const userRoles = (user as any)?.roles || [user?.role || 'agent'];
  const canApprove = userRoles.includes('admin') || userRoles.includes('quality_analyst');
  const isAdmin = userRoles.includes('admin');

  return (
    
      {/* Header */}
      
        
           navigate('/leads')}
            data-testid="button-back"
          >
            
          
          
            
              {lead.contact?.fullName || lead.contactName || 'Unnamed Lead'}
            
            
              Lead #{lead.id.slice(0, 8)}
              •
              {getStatusBadge(lead.qaStatus)}
            
          
        
        
          {/* Navigation buttons */}
          
             previousLeadId && navigate(`/leads/${previousLeadId}`)}
              disabled={!previousLeadId}
              data-testid="button-previous-lead"
              title="Previous lead"
            >
              
            
             nextLeadId && navigate(`/leads/${nextLeadId}`)}
              disabled={!nextLeadId}
              data-testid="button-next-lead"
              title="Next lead"
            >
              
            
          
          {lead.recordingUrl && (
            
              {isLoadingGcsUrl ?  : }
              Play Recording
            
          )}
           validateCompanyMutation.mutate(false)}
            disabled={validateCompanyMutation.isPending}
            data-testid="button-validate-company"
            title="Validate company with Companies House UK (uses cache if available)"
          >
            
            Validate Company
          
          {lead.contact?.email && (
             validateEmailMutation.mutate()}
              disabled={validateEmailMutation.isPending}
              data-testid="button-validate-email"
              title="Validate email with SMTP verification"
            >
              
              {validateEmailMutation.isPending ? 'Validating...' : 'Validate Email'}
            
          )}
          {canApprove && lead.qaStatus !== 'published' && (
            <>
              {lead.qaStatus !== 'approved' && (
                 approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                  data-testid="button-approve"
                >
                  
                  Approve Lead
                
              )}
              {lead.qaStatus !== 'rejected' && (
                 setRejectDialogOpen(true)}
                  data-testid="button-reject"
                >
                  
                  Reject
                
              )}
              {isAdmin && (
                 setDeleteDialogOpen(true)}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete"
                  className="text-destructive hover:text-destructive"
                >
                  
                  Delete
                
              )}
            
          )}
        
      

      
        {/* Contact Information */}
        
          
            
              
              Contact Information
            
          
          
            
              
                Full Name
                
                  {lead.contact?.fullName || lead.contactName || 'N/A'}
                
              
              
                Job Title
                
                  {lead.contact?.jobTitle || 'N/A'}
                
              
              
                Email
                {lead.contact?.email || lead.contactEmail ? (
                  
                    
                      
                      {lead.contact?.email || lead.contactEmail}
                    
                    {lead.contact?.emailStatus && (
                      
                        Validation Status:
                        
                          {lead.contact.emailStatus.replace(/_/g, ' ').toUpperCase()}
                        
                      
                    )}
                  
                ) : (
                  N/A
                )}
              
              
                Direct Phone
                {lead.contact?.directPhone || lead.directPhone ? (
                  
                    
                    {lead.contact?.directPhone || lead.directPhone}
                  
                ) : (
                  N/A
                )}
              
              
                Mobile Phone
                {lead.contact?.mobilePhone ? (
                  
                    
                    {lead.contact.mobilePhone}
                  
                ) : (
                  N/A
                )}
              
              {lead.dialedNumber && (
                
                  Number Called (Agent Dialed)
                  
                    
                    {lead.dialedNumber}
                  
                
              )}
              
                Location
                
                  
                  {[lead.contact?.city, lead.contact?.state, lead.contact?.country].filter(Boolean).join(', ') || 'N/A'}
                
              
              
                Seniority Level
                {lead.contact?.seniorityLevel ? (
                  
                    {lead.contact.seniorityLevel}
                  
                ) : (
                  N/A
                )}
              
              
                LinkedIn Profile
                {lead.contact?.linkedinUrl ? (
                  
                    
                    View LinkedIn Profile
                  
                ) : (
                  N/A
                )}
              
            
          
        

        {/* Account Information */}
        
          
            
              
              Account Information
            
          
          
            
              Company Name
              
                {lead.account?.name || 'N/A'}
              
            
            
            
              
                Website Domain
                {lead.account?.domain ? (
                  
                    
                    {lead.account.domain}
                  
                ) : (
                  N/A
                )}
              
              
                Industry
                
                  {lead.account?.industryStandardized || 'N/A'}
                
              
              
                Employee Size Range
                
                  {lead.account?.employeesSizeRange || lead.account?.staffCount?.toLocaleString() || 'N/A'}
                
              
              
                Revenue Range
                
                  {lead.account?.revenueRange || 
                    (lead.account?.annualRevenue ? `$${Number(lead.account.annualRevenue).toLocaleString()}` : 'N/A')}
                
              
              
                HQ Location
                
                  
                  {[lead.account?.hqCity, lead.account?.hqState, lead.account?.hqCountry].filter(Boolean).join(', ') || 'N/A'}
                
              
              {lead.account?.emailDeliverabilityScore !== null && lead.account?.emailDeliverabilityScore !== undefined && (
                
                  
                    
                      Email Deliverability Score
                      
                        
                          {Number(lead.account.emailDeliverabilityScore).toFixed(0)}
                          /100
                        
                        = 80 ? 'default' :
                            Number(lead.account.emailDeliverabilityScore) >= 60 ? 'secondary' :
                            'destructive'
                          }
                        >
                          {Number(lead.account.emailDeliverabilityScore) >= 80 ? 'Excellent' :
                           Number(lead.account.emailDeliverabilityScore) >= 60 ? 'Good' :
                           'Needs Attention'}
                        
                      
                    
                    {lead.account?.emailDeliverabilityUpdatedAt && (
                      
                        Last Updated
                        
                          {new Date(lead.account.emailDeliverabilityUpdatedAt).toLocaleDateString()}
                        
                      
                    )}
                  
                
              )}
              
                HQ Phone
                {lead.account?.mainPhone ? (
                  
                    
                    {lead.account.mainPhone}
                  
                ) : (
                  N/A
                )}
              
              
                Company LinkedIn URL
                {lead.account?.linkedinUrl ? (
                  
                    
                    View Company LinkedIn Profile
                  
                ) : (
                  N/A
                )}
              
            
          
        

        {/* Companies House Validation */}
        {lead.qaData && (lead.qaData as any).ch_validation_status && (
          
            
              
                
                  
                  Companies House Validation
                
                 validateCompanyMutation.mutate(true)}
                  disabled={validateCompanyMutation.isPending}
                  data-testid="button-refresh-validation"
                  title="Force refresh validation (ignores cache)"
                >
                  
                
              
            
            
              
                Status
                
                  {(lead.qaData as any).ch_validation_status === 'validated' || (lead.qaData as any).ch_validation_status === 'found' ? 'Validated' :
                   (lead.qaData as any).ch_validation_status === 'not_found' ? 'Not Found' :
                   (lead.qaData as any).ch_validation_status === 'api_error' ? 'API Error' :
                   'Pending'}
                
              
              
              {(lead.qaData as any).ch_legal_name && (
                <>
                  
                  
                    Official Legal Name
                    
                      {(lead.qaData as any).ch_legal_name}
                    
                  
                
              )}
              
              {(lead.qaData as any).ch_company_number && (
                
                  Company Number
                  
                    {(lead.qaData as any).ch_company_number}
                  
                
              )}
              
              {(lead.qaData as any).ch_status && (
                
                  Company Status
                  
                    {(lead.qaData as any).ch_status}
                  
                
              )}
              
              {(lead.qaData as any).ch_date_of_creation && (
                
                  Date of Creation
                  
                    {new Date((lead.qaData as any).ch_date_of_creation).toLocaleDateString()}
                  
                
              )}
              
              {(lead.qaData as any).ch_address && (
                
                  Registered Address
                  
                    {(lead.qaData as any).ch_address}
                  
                
              )}
              
              {(lead.qaData as any).ch_validated_at && (
                
                  Validated At
                  
                    {new Date((lead.qaData as any).ch_validated_at).toLocaleString()}
                  
                
              )}
              
              {(lead.qaData as any).ch_error && (
                
                  
                    {(lead.qaData as any).ch_error}
                  
                
              )}
            
          
        )}

        {/* Email Validation */}
        {lead.qaData && (lead.qaData as any).emailValidation && (
          
            
              
                
                Email Validation
              
            
            
              
                Email Status
                
                  {(lead.qaData as any).emailValidation.status.replace(/_/g, ' ').toUpperCase()}
                
              
              
              
                Deliverable
                
                  {(lead.qaData as any).emailValidation.isDeliverable ? 'Yes' : 'No'}
                
              
              
              {(lead.qaData as any).emailValidation.confidence && (
                
                  Confidence Score
                  
                    {(lead.qaData as any).emailValidation.confidence}%
                  
                
              )}
              
              {(lead.qaData as any).emailValidation.validatedAt && (
                
                  Validated At
                  
                    {new Date((lead.qaData as any).emailValidation.validatedAt).toLocaleString()}
                  
                
              )}
            
          
        )}

        {/* Campaign & Agent Information */}
        
          
            
              
              Campaign & Agent
            
          
          
            
              Campaign
              
                {lead.campaign?.name || 'N/A'}
              
              
                {lead.campaign?.type || 'N/A'}
              
            
            
            
              Assigned Agent
              {lead.agent ? (
                
                  
                    
                      {(lead.agent.firstName?.[0] || '') + (lead.agent.lastName?.[0] || '')}
                    
                  
                  
                    
                      {lead.agent.firstName} {lead.agent.lastName}
                    
                    
                      {lead.agent.email}
                    
                  
                
              ) : (
                Not assigned
              )}
            
            {lead.approvedById && lead.approver?.firstName && (
              <>
                
                
                  Approved By
                  
                    {lead.approver.firstName} {lead.approver.lastName}
                  
                  {lead.approvedAt && (
                    
                      {new Date(lead.approvedAt).toLocaleString()}
                    
                  )}
                
              
            )}
            {lead.rejectedById && lead.rejector?.firstName && (
              <>
                
                
                  Rejected By
                  
                    {lead.rejector.firstName} {lead.rejector.lastName}
                  
                  {lead.rejectedAt && (
                    
                      {new Date(lead.rejectedAt).toLocaleString()}
                    
                  )}
                  {lead.rejectedReason && (
                    
                      Reason: {lead.rejectedReason}
                    
                  )}
                
              
            )}
          
        
      

      {/* Call Recording Player */}
      
        
          
            
              
                
                Call Recording
              
              
                {lead.recordingUrl 
                  ? `Duration: ${lead.callDuration ? formatDuration(lead.callDuration) : 'N/A'}` 
                  : lead.callAttemptId 
                    ? 'Recording can be fetched from Telnyx'
                    : 'No call attempt recorded'}
              
            
            {!lead.recordingUrl && lead.callAttemptId && (
               fetchRecordingMutation.mutate()}
                disabled={fetchRecordingMutation.isPending}
                data-testid="button-fetch-recording"
              >
                
                Fetch Recording
              
            )}
          
        
        {!lead.recordingUrl && !lead.callAttemptId && (
          
            
              This lead has no associated call attempt.
              Recordings are only available for leads created from actual phone calls.
            
          
        )}
        {lead.recordingUrl && (
          
            
              
                {isLoadingGcsUrl ?  : }
                Play in New Tab
              
              
                
                Download
              
            
            
            
              Recording URL
              
                
                 {
                    navigator.clipboard.writeText(activeRecordingUrl || '');
                    toast({
                      title: "Copied",
                      description: "Recording URL copied to clipboard",
                    });
                  }}
                  data-testid="button-copy-url"
                >
                  Copy
                
              
            
          
        )}
      

      {/* Tabs for Transcript and AI Analysis */}
      
        
          
            
            Transcript
          
          
            
            AI Analysis
          
          
            
            Notes
          
        

        
          
            
              
                Call Transcript
                {lead.recordingUrl && !lead.transcript && (
                   transcribeMutation.mutate()}
                    disabled={transcribeMutation.isPending || lead.transcriptionStatus === 'processing'}
                    data-testid="button-transcribe"
                  >
                    {lead.transcriptionStatus === 'processing' ? 'Processing...' : 'Generate Transcript'}
                  
                )}
              
              {lead.transcriptionStatus && (
                Status: {lead.transcriptionStatus}
              )}
            
            
              {lead.transcript ? (
                
                  
                    {lead.transcript}
                  
                
              ) : (
                
                  No transcript available. {lead.recordingUrl && 'Click "Generate Transcript" to create one.'}
                
              )}
            
          
        

        
          
            
              
                AI Qualification Analysis
                {lead.transcript && (
                   analyzeMutation.mutate()}
                    disabled={analyzeMutation.isPending}
                    data-testid="button-analyze"
                  >
                    {analyzeMutation.isPending ? 'Analyzing...' : lead.aiAnalysis ? 'Re-run AI Analysis' : 'Run AI Analysis'}
                  
                )}
              
            
            
              {lead.aiQualificationStatus && (
                
                  
                    Qualification Status
                    
                      {getQualificationBadge(lead.aiQualificationStatus)}
                    
                  
                  {lead.aiScore && (
                    
                      AI Score
                      
                        {Number(lead.aiScore).toFixed(0)}
                        /100
                      
                    
                  )}
                
              )}
              
              {/* Detailed AI Insights - Show when review is needed */}
              {lead.qaData && (lead.qaData as any).ai_analysis && (
                
                  {/* Show detailed insights when needs review or score 
                      
                        
                        AI Review Insights
                      

                      {/* Missing Information */}
                      {(lead.qaData as any).ai_analysis.missing_info && (lead.qaData as any).ai_analysis.missing_info.length > 0 && (
                        
                          Missing Information
                          
                            {(lead.qaData as any).ai_analysis.missing_info.map((info: string, idx: number) => (
                              {info}
                            ))}
                          
                        
                      )}

                      {/* Recommendations */}
                      {(lead.qaData as any).ai_analysis.recommendations && (lead.qaData as any).ai_analysis.recommendations.length > 0 && (
                        
                          Recommended Actions
                          
                            {(lead.qaData as any).ai_analysis.recommendations.map((rec: string, idx: number) => (
                              {rec}
                            ))}
                          
                        
                      )}
                    
                  )}

                  {/* Detailed Scoring Analysis - Show for all analyzed leads */}
                  {(lead.qaData as any).ai_analysis.analysis && (
                    
                      
                        
                        Detailed Scoring Analysis
                      
                      
                        {Object.entries((lead.qaData as any).ai_analysis.analysis).map(([criterion, data]: [string, any]) => (
                          
                            
                              
                                {criterion.replace(/_/g, ' ')}
                              
                              = 70 ? 'outline' : data.score >= 40 ? 'secondary' : 'destructive'}
                                className={
                                  data.score >= 70 
                                    ? 'text-xs bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700'
                                    : data.score >= 40 
                                    ? 'text-xs bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-700'
                                    : 'text-xs'
                                }
                              >
                                {data.score}/100
                              
                            
                            {data.evidence && (
                              
                                "{data.evidence}"
                              
                            )}
                          
                        ))}
                      
                    
                  )}
                
              )}

              {/* Custom QA Data Display */}
              {lead.qaData && Object.keys(lead.qaData).filter(k => k !== 'ai_analysis').length > 0 && (
                
                  Custom Qualification Data
                  
                    {Object.entries(lead.qaData).filter(([key]) => key !== 'ai_analysis').map(([key, value]) => (
                      
                        
                          {key.replace(/_/g, ' ')}
                        
                        
                          {typeof value === 'boolean' 
                            ? (value ? 'Yes' : 'No')
                            : typeof value === 'object' && value !== null
                              ? JSON.stringify(value)
                              : String(value || 'N/A')}
                        
                      
                    ))}
                  
                
              )}
              
              {lead.aiAnalysis ? (
                
                  {typeof lead.aiAnalysis === 'object' && (
                    <>
                      {(lead.aiAnalysis as any).summary && (
                        
                          Summary
                          {(lead.aiAnalysis as any).summary}
                        
                      )}
                      {(lead.aiAnalysis as any).keyPoints && Array.isArray((lead.aiAnalysis as any).keyPoints) && (
                        
                          Key Points
                          
                            {(lead.aiAnalysis as any).keyPoints.map((point: string, index: number) => (
                              {point}
                            ))}
                          
                        
                      )}
                    
                  )}
                
              ) : (
                
                  No AI analysis available. {lead.transcript && 'Click "Run AI Analysis" to generate insights.'}
                
              )}
            
          
        

        
          
            
              
                QA Notes
                {!editingNotes && (
                   {
                      setEditingNotes(true);
                      setNotesText(lead.notes || '');
                    }}
                    data-testid="button-edit-notes"
                  >
                    Edit Notes
                  
                )}
              
              
                Add quality assurance notes and observations for this lead
              
            
            
              {editingNotes ? (
                
                  
                    Notes
                     setNotesText(e.target.value)}
                      placeholder="Enter QA notes, observations, or feedback..."
                      rows={8}
                      data-testid="input-notes"
                    />
                  
                  
                     {
                        setEditingNotes(false);
                        setNotesText('');
                      }}
                      data-testid="button-cancel-notes"
                    >
                      Cancel
                    
                     updateNotesMutation.mutate(notesText)}
                      disabled={updateNotesMutation.isPending}
                      data-testid="button-save-notes"
                    >
                      
                      {updateNotesMutation.isPending ? 'Saving...' : 'Save Notes'}
                    
                  
                
              ) : lead.notes ? (
                
                  {lead.notes}
                
              ) : (
                
                  No notes available. Click "Edit Notes" to add QA observations.
                
              )}
              {lead.rejectedReason && (
                
                  Rejection Reason
                  
                    {lead.rejectedReason}
                  
                
              )}
            
          
        
      

      {/* Reject Dialog */}
      
        
          
            Reject Lead
            
              Please provide a reason for rejecting this lead.
            
          
           setRejectReason(e.target.value)}
            data-testid="input-reject-reason"
          />
          
             setRejectDialogOpen(false)}
              data-testid="button-cancel-reject"
            >
              Cancel
            
             rejectMutation.mutate(rejectReason)}
              disabled={!rejectReason || rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              Reject Lead
            
          
        
      

      {/* Delete Confirmation Dialog */}
      
        
          
            Delete Lead
            
              Are you sure you want to delete this lead? This action cannot be undone.
            
          
          
             setDeleteDialogOpen(false)}
              data-testid="button-cancel-delete"
            >
              Cancel
            
             deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              variant="destructive"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && (
                
              )}
              Delete Lead
            
          
        
      
    
  );
}