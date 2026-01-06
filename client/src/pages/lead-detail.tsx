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
  Pause,
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
import { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

export default function LeadDetailPage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { user } = useAuth();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState("");

  // Suppress unhandled promise rejections from expired/invalid audio URLs
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (event.reason?.message?.includes('Failed to load') || 
          event.reason?.message?.includes('no supported source')) {
        event.preventDefault();
        console.warn('Audio loading failed (likely expired presigned URL):', event.reason);
      }
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    return () => window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  }, []);

  const { data: lead, isLoading } = useQuery({
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
  const nextLeadId = currentIndex >= 0 && currentIndex < (allLeads?.length ?? 0) - 1 ? allLeads?.[currentIndex + 1]?.id : null;

  // Fetch fresh recording URL to avoid expired presigned URLs
  const { data: recordingUrlData, isLoading: isLoadingRecordingUrl } = useQuery({
    queryKey: ['/api/leads', id, 'recording-url'],
    enabled: !!id && !!lead?.recordingUrl,
    retry: false,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes (URLs expire in 10 minutes)
  });

  // Use fresh recording URL if available, otherwise fall back to stale URL
  const activeRecordingUrl = recordingUrlData?.url || lead?.recordingUrl;

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }
      return await apiRequest('POST', `/api/leads/${id}/approve`, { approvedById: user.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads', id] });
      toast({
        title: "Success",
        description: "Lead approved successfully",
      });
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

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleDownload = async () => {
    if (activeRecordingUrl) {
      window.open(activeRecordingUrl, '_blank');
      toast({
        title: "Download Started",
        description: "Call recording download has started.",
      });
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
      new: { variant: "secondary", label: "New" },
      under_review: { variant: "default", label: "Under Review" },
      approved: { variant: "outline", label: "Approved" },
      rejected: { variant: "destructive", label: "Rejected" },
      published: { variant: "outline", label: "Published" },
    };
    const { variant, label } = config[status] || config.new;
    return <Badge variant={variant} data-testid={`badge-status-${status}`}>{label}</Badge>;
  };

  const getQualificationBadge = (status: string) => {
    if (status === 'qualified') return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700">Qualified</Badge>;
    if (status === 'not_qualified') return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-300 dark:bg-red-900/20 dark:text-red-400 dark:border-red-700">Not Qualified</Badge>;
    return <Badge variant="secondary">Needs Review</Badge>;
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-6">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <XCircle className="h-16 w-16 text-muted-foreground mb-4" />
        <h2 className="text-2xl font-semibold">Lead Not Found</h2>
        <p className="text-muted-foreground mt-2">The lead you're looking for doesn't exist.</p>
        <Button onClick={() => navigate('/leads')} className="mt-4" data-testid="button-back-to-leads">
          Back to Leads
        </Button>
      </div>
    );
  }

  // Check if user has admin or quality_analyst role (support multi-role system)
  const userRoles = (user as any)?.roles || [user?.role || 'agent'];
  const canApprove = userRoles.includes('admin') || userRoles.includes('quality_analyst');
  const isAdmin = userRoles.includes('admin');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/leads')}
            data-testid="button-back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-lead-name">
              {lead.contact?.fullName || lead.contactName || 'Unnamed Lead'}
            </h1>
            <div className="text-muted-foreground flex items-center gap-2">
              <span>Lead #{lead.id.slice(0, 8)}</span>
              <span>•</span>
              {getStatusBadge(lead.qaStatus)}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {/* Navigation buttons */}
          <div className="flex items-center gap-1 mr-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => previousLeadId && navigate(`/leads/${previousLeadId}`)}
              disabled={!previousLeadId}
              data-testid="button-previous-lead"
              title="Previous lead"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => nextLeadId && navigate(`/leads/${nextLeadId}`)}
              disabled={!nextLeadId}
              data-testid="button-next-lead"
              title="Next lead"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          {lead.recordingUrl && (
            <Button
              variant="outline"
              onClick={togglePlay}
              data-testid="button-quick-play"
              title={isPlaying ? "Pause recording" : "Play recording"}
            >
              {isPlaying ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
              {isPlaying ? 'Pause' : 'Play'} Recording
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() => validateCompanyMutation.mutate(false)}
            disabled={validateCompanyMutation.isPending}
            data-testid="button-validate-company"
            title="Validate company with Companies House UK (uses cache if available)"
          >
            <Building2 className="h-4 w-4 mr-2" />
            Validate Company
          </Button>
          {lead.contact?.email && (
            <Button
              variant="outline"
              onClick={() => validateEmailMutation.mutate()}
              disabled={validateEmailMutation.isPending}
              data-testid="button-validate-email"
              title="Validate email with SMTP verification"
            >
              <Mail className="h-4 w-4 mr-2" />
              {validateEmailMutation.isPending ? 'Validating...' : 'Validate Email'}
            </Button>
          )}
          {canApprove && lead.qaStatus !== 'published' && (
            <>
              {lead.qaStatus !== 'approved' && (
                <Button
                  onClick={() => approveMutation.mutate()}
                  disabled={approveMutation.isPending}
                  data-testid="button-approve"
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Approve Lead
                </Button>
              )}
              {lead.qaStatus !== 'rejected' && (
                <Button
                  variant="destructive"
                  onClick={() => setRejectDialogOpen(true)}
                  data-testid="button-reject"
                >
                  <XCircle className="h-4 w-4 mr-2" />
                  Reject
                </Button>
              )}
              {isAdmin && (
                <Button
                  variant="ghost"
                  onClick={() => setDeleteDialogOpen(true)}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Contact Information */}
        <Card data-testid="card-contact">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Full Name</p>
                <p className="font-medium" data-testid="text-contact-name">
                  {lead.contact?.fullName || lead.contactName || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Job Title</p>
                <p className="font-medium" data-testid="text-contact-title">
                  {lead.contact?.jobTitle || 'N/A'}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Email</p>
                {lead.contact?.email || lead.contactEmail ? (
                  <div className="space-y-2">
                    <a 
                      href={`mailto:${lead.contact?.email || lead.contactEmail}`}
                      className="font-medium text-sm text-primary hover:underline flex items-center gap-1"
                      data-testid="text-contact-email"
                    >
                      <Mail className="h-3 w-3" />
                      {lead.contact?.email || lead.contactEmail}
                    </a>
                    {lead.contact?.emailStatus && (
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">Validation Status:</p>
                        <Badge 
                          variant={
                            lead.contact.emailStatus === 'valid' ? 'default' :
                            lead.contact.emailStatus === 'acceptable' ? 'secondary' :
                            lead.contact.emailStatus === 'invalid' ? 'destructive' :
                            'outline'
                          }
                          data-testid="badge-email-status"
                        >
                          {lead.contact.emailStatus.replace(/_/g, ' ').toUpperCase()}
                        </Badge>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="font-medium text-sm text-muted-foreground">N/A</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Direct Phone</p>
                {lead.contact?.directPhone || lead.directPhone ? (
                  <a 
                    href={`tel:${lead.contact?.directPhone || lead.directPhone}`}
                    className="font-medium text-primary hover:underline flex items-center gap-1"
                    data-testid="text-contact-phone"
                  >
                    <Phone className="h-3 w-3" />
                    {lead.contact?.directPhone || lead.directPhone}
                  </a>
                ) : (
                  <p className="font-medium text-muted-foreground">N/A</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Mobile Phone</p>
                {lead.contact?.mobilePhone ? (
                  <a 
                    href={`tel:${lead.contact.mobilePhone}`}
                    className="font-medium text-primary hover:underline flex items-center gap-1"
                    data-testid="text-contact-mobile"
                  >
                    <Phone className="h-3 w-3" />
                    {lead.contact.mobilePhone}
                  </a>
                ) : (
                  <p className="font-medium text-muted-foreground">N/A</p>
                )}
              </div>
              {lead.dialedNumber && (
                <div className="col-span-2 bg-primary/5 dark:bg-primary/10 p-3 rounded-md border border-primary/20">
                  <p className="text-xs text-muted-foreground mb-1">Number Called (Agent Dialed)</p>
                  <a 
                    href={`tel:${lead.dialedNumber}`}
                    className="font-medium text-primary hover:underline flex items-center gap-1"
                    data-testid="text-dialed-number"
                  >
                    <Phone className="h-4 w-4" />
                    {lead.dialedNumber}
                  </a>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1">Location</p>
                <p className="font-medium text-sm flex items-center gap-1" data-testid="text-contact-location">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  {[lead.contact?.city, lead.contact?.state, lead.contact?.country].filter(Boolean).join(', ') || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Seniority Level</p>
                {lead.contact?.seniorityLevel ? (
                  <Badge variant="outline" data-testid="badge-seniority">
                    {lead.contact.seniorityLevel}
                  </Badge>
                ) : (
                  <p className="font-medium text-muted-foreground">N/A</p>
                )}
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-1">LinkedIn Profile</p>
                {lead.contact?.linkedinUrl ? (
                  <a 
                    href={lead.contact.linkedinUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 text-sm font-medium"
                    data-testid="link-contact-linkedin"
                  >
                    <Linkedin className="h-4 w-4" />
                    View LinkedIn Profile
                  </a>
                ) : (
                  <p className="font-medium text-muted-foreground">N/A</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Account Information */}
        <Card data-testid="card-account">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Account Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Company Name</p>
              <p className="font-semibold text-lg" data-testid="text-account-name">
                {lead.account?.name || 'N/A'}
              </p>
            </div>
            <Separator />
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Website Domain</p>
                {lead.account?.domain ? (
                  <a 
                    href={`https://${lead.account.domain}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1 font-medium"
                    data-testid="link-account-domain"
                  >
                    <Globe className="h-4 w-4" />
                    {lead.account.domain}
                  </a>
                ) : (
                  <p className="text-sm font-medium text-muted-foreground">N/A</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Industry</p>
                <p className="text-sm font-medium" data-testid="text-account-industry">
                  {lead.account?.industryStandardized || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Employee Size Range</p>
                <p className="text-sm font-medium" data-testid="text-account-employees">
                  {lead.account?.employeesSizeRange || lead.account?.staffCount?.toLocaleString() || 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">Revenue Range</p>
                <p className="text-sm font-medium" data-testid="text-account-revenue">
                  {lead.account?.revenueRange || 
                    (lead.account?.annualRevenue ? `$${Number(lead.account.annualRevenue).toLocaleString()}` : 'N/A')}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">HQ Location</p>
                <p className="text-sm font-medium flex items-center gap-1" data-testid="text-account-hq">
                  <MapPin className="h-3 w-3 text-muted-foreground" />
                  {[lead.account?.hqCity, lead.account?.hqState, lead.account?.hqCountry].filter(Boolean).join(', ') || 'N/A'}
                </p>
              </div>
              {lead.account?.emailDeliverabilityScore !== null && lead.account?.emailDeliverabilityScore !== undefined && (
                <div className="col-span-2 bg-card border rounded-lg p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Email Deliverability Score</p>
                      <div className="flex items-center gap-3">
                        <p className="text-2xl font-bold" data-testid="text-email-deliverability-score">
                          {Number(lead.account.emailDeliverabilityScore).toFixed(0)}
                          <span className="text-sm text-muted-foreground">/100</span>
                        </p>
                        <Badge 
                          variant={
                            Number(lead.account.emailDeliverabilityScore) >= 80 ? 'default' :
                            Number(lead.account.emailDeliverabilityScore) >= 60 ? 'secondary' :
                            'destructive'
                          }
                        >
                          {Number(lead.account.emailDeliverabilityScore) >= 80 ? 'Excellent' :
                           Number(lead.account.emailDeliverabilityScore) >= 60 ? 'Good' :
                           'Needs Attention'}
                        </Badge>
                      </div>
                    </div>
                    {lead.account?.emailDeliverabilityUpdatedAt && (
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Last Updated</p>
                        <p className="text-xs font-medium">
                          {new Date(lead.account.emailDeliverabilityUpdatedAt).toLocaleDateString()}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-1">HQ Phone</p>
                {lead.account?.mainPhone ? (
                  <a 
                    href={`tel:${lead.account.mainPhone}`}
                    className="text-sm font-medium text-primary hover:underline flex items-center gap-1"
                    data-testid="text-account-phone"
                  >
                    <Phone className="h-3 w-3" />
                    {lead.account.mainPhone}
                  </a>
                ) : (
                  <p className="text-sm font-medium text-muted-foreground">N/A</p>
                )}
              </div>
              <div className="col-span-2">
                <p className="text-xs text-muted-foreground mb-1">Company LinkedIn URL</p>
                {lead.account?.linkedinUrl ? (
                  <a 
                    href={lead.account.linkedinUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline flex items-center gap-1 font-medium"
                    data-testid="link-account-linkedin"
                  >
                    <Linkedin className="h-4 w-4" />
                    View Company LinkedIn Profile
                  </a>
                ) : (
                  <p className="text-sm font-medium text-muted-foreground">N/A</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Companies House Validation */}
        {lead.qaData && (lead.qaData as any).ch_validation_status && (
          <Card data-testid="card-companies-house">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Companies House Validation
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => validateCompanyMutation.mutate(true)}
                  disabled={validateCompanyMutation.isPending}
                  data-testid="button-refresh-validation"
                  title="Force refresh validation (ignores cache)"
                >
                  <RefreshCw className={`h-4 w-4 ${validateCompanyMutation.isPending ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Status</p>
                <Badge 
                  variant={
                    (lead.qaData as any).ch_validation_status === 'found' ? 'default' :
                    (lead.qaData as any).ch_validation_status === 'not_found' ? 'destructive' :
                    'secondary'
                  }
                  data-testid="badge-ch-status"
                >
                  {(lead.qaData as any).ch_validation_status === 'validated' || (lead.qaData as any).ch_validation_status === 'found' ? 'Validated' :
                   (lead.qaData as any).ch_validation_status === 'not_found' ? 'Not Found' :
                   (lead.qaData as any).ch_validation_status === 'api_error' ? 'API Error' :
                   'Pending'}
                </Badge>
              </div>
              
              {(lead.qaData as any).ch_legal_name && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Official Legal Name</p>
                    <p className="font-semibold text-lg" data-testid="text-ch-legal-name">
                      {(lead.qaData as any).ch_legal_name}
                    </p>
                  </div>
                </>
              )}
              
              {(lead.qaData as any).ch_company_number && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Company Number</p>
                  <p className="text-sm font-medium font-mono" data-testid="text-ch-company-number">
                    {(lead.qaData as any).ch_company_number}
                  </p>
                </div>
              )}
              
              {(lead.qaData as any).ch_status && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Company Status</p>
                  <Badge 
                    variant={(lead.qaData as any).ch_is_active ? 'default' : 'destructive'}
                    data-testid="badge-ch-company-status"
                  >
                    {(lead.qaData as any).ch_status}
                  </Badge>
                </div>
              )}
              
              {(lead.qaData as any).ch_date_of_creation && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Date of Creation</p>
                  <p className="text-sm font-medium" data-testid="text-ch-creation-date">
                    {new Date((lead.qaData as any).ch_date_of_creation).toLocaleDateString()}
                  </p>
                </div>
              )}
              
              {(lead.qaData as any).ch_address && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-1">Registered Address</p>
                  <p className="text-sm font-medium" data-testid="text-ch-address">
                    {(lead.qaData as any).ch_address}
                  </p>
                </div>
              )}
              
              {(lead.qaData as any).ch_validated_at && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Validated At</p>
                  <p className="text-xs font-medium text-muted-foreground" data-testid="text-ch-validated-at">
                    {new Date((lead.qaData as any).ch_validated_at).toLocaleString()}
                  </p>
                </div>
              )}
              
              {(lead.qaData as any).ch_error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                  <p className="text-xs font-medium text-destructive" data-testid="text-ch-error">
                    {(lead.qaData as any).ch_error}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Email Validation */}
        {lead.qaData && (lead.qaData as any).emailValidation && (
          <Card data-testid="card-email-validation">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Email Validation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-xs text-muted-foreground mb-1">Email Status</p>
                <Badge 
                  variant={
                    (lead.qaData as any).emailValidation.status === 'safe_to_send' || (lead.qaData as any).emailValidation.status === 'valid' ? 'default' :
                    (lead.qaData as any).emailValidation.status === 'invalid' || (lead.qaData as any).emailValidation.status === 'disposable' ? 'destructive' :
                    'secondary'
                  }
                  data-testid="badge-email-validation-status"
                >
                  {(lead.qaData as any).emailValidation.status.replace(/_/g, ' ').toUpperCase()}
                </Badge>
              </div>
              
              <div>
                <p className="text-xs text-muted-foreground mb-1">Deliverable</p>
                <Badge 
                  variant={(lead.qaData as any).emailValidation.isDeliverable ? 'default' : 'destructive'}
                  data-testid="badge-email-deliverable"
                >
                  {(lead.qaData as any).emailValidation.isDeliverable ? 'Yes' : 'No'}
                </Badge>
              </div>
              
              {(lead.qaData as any).emailValidation.confidence && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Confidence Score</p>
                  <p className="text-lg font-semibold" data-testid="text-email-confidence">
                    {(lead.qaData as any).emailValidation.confidence}%
                  </p>
                </div>
              )}
              
              {(lead.qaData as any).emailValidation.validatedAt && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Validated At</p>
                  <p className="text-xs font-medium text-muted-foreground" data-testid="text-email-validated-at">
                    {new Date((lead.qaData as any).emailValidation.validatedAt).toLocaleString()}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Campaign & Agent Information */}
        <Card data-testid="card-campaign-agent">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Briefcase className="h-5 w-5" />
              Campaign & Agent
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-xs text-muted-foreground">Campaign</p>
              <p className="font-semibold" data-testid="text-campaign-name">
                {lead.campaign?.name || 'N/A'}
              </p>
              <Badge variant="secondary" className="mt-1">
                {lead.campaign?.type || 'N/A'}
              </Badge>
            </div>
            <Separator />
            <div>
              <p className="text-xs text-muted-foreground">Assigned Agent</p>
              {lead.agent ? (
                <div className="flex items-center gap-2 mt-1">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">
                      {(lead.agent.firstName?.[0] || '') + (lead.agent.lastName?.[0] || '')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="text-sm font-medium" data-testid="text-agent-name">
                      {lead.agent.firstName} {lead.agent.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground" data-testid="text-agent-email">
                      {lead.agent.email}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Not assigned</p>
              )}
            </div>
            {lead.approvedById && lead.approver?.firstName && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground">Approved By</p>
                  <p className="text-sm font-medium" data-testid="text-approver-name">
                    {lead.approver.firstName} {lead.approver.lastName}
                  </p>
                  {lead.approvedAt && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(lead.approvedAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </>
            )}
            {lead.rejectedById && lead.rejector?.firstName && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground">Rejected By</p>
                  <p className="text-sm font-medium" data-testid="text-rejector-name">
                    {lead.rejector.firstName} {lead.rejector.lastName}
                  </p>
                  {lead.rejectedAt && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(lead.rejectedAt).toLocaleString()}
                    </p>
                  )}
                  {lead.rejectedReason && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Reason: {lead.rejectedReason}
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Call Recording Player */}
      <Card data-testid="card-recording">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                Call Recording
              </CardTitle>
              <CardDescription>
                {lead.recordingUrl 
                  ? `Duration: ${lead.callDuration ? formatDuration(lead.callDuration) : 'N/A'}` 
                  : lead.callAttemptId 
                    ? 'Recording can be fetched from Telnyx'
                    : 'No call attempt recorded'}
              </CardDescription>
            </div>
            {!lead.recordingUrl && lead.callAttemptId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchRecordingMutation.mutate()}
                disabled={fetchRecordingMutation.isPending}
                data-testid="button-fetch-recording"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${fetchRecordingMutation.isPending ? 'animate-spin' : ''}`} />
                Fetch Recording
              </Button>
            )}
          </div>
        </CardHeader>
        {!lead.recordingUrl && !lead.callAttemptId && (
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <p className="text-sm">This lead has no associated call attempt.</p>
              <p className="text-xs mt-1">Recordings are only available for leads created from actual phone calls.</p>
            </div>
          </CardContent>
        )}
        {lead.recordingUrl && (
          <CardContent className="space-y-4">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={togglePlay}
                data-testid="button-play-pause"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <div className="flex-1">
                <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="absolute left-0 top-0 h-full bg-primary"
                    style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>{formatDuration(currentTime)}</span>
                  <span>{formatDuration(duration)}</span>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={handleDownload}
                data-testid="button-download"
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
            </div>
            <Separator />
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Recording URL</p>
              <div className="flex items-center gap-2">
                <Input
                  value={activeRecordingUrl || ''}
                  readOnly
                  className="flex-1 font-mono text-xs"
                  data-testid="input-recording-url"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(activeRecordingUrl || '');
                    toast({
                      title: "Copied",
                      description: "Recording URL copied to clipboard",
                    });
                  }}
                  data-testid="button-copy-url"
                >
                  Copy
                </Button>
              </div>
            </div>
            {activeRecordingUrl && activeRecordingUrl.startsWith('http') && (
              <audio
                ref={audioRef}
                src={activeRecordingUrl}
                preload="none"
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
                onEnded={() => setIsPlaying(false)}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onError={(e) => {
                  console.warn('Audio loading failed for URL:', activeRecordingUrl);
                  setIsPlaying(false);
                  e.preventDefault();
                }}
              />
            )}
          </CardContent>
        )}
      </Card>

      {/* Tabs for Transcript and AI Analysis */}
      <Tabs defaultValue="transcript" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="transcript" data-testid="tab-transcript">
            <FileText className="h-4 w-4 mr-2" />
            Transcript
          </TabsTrigger>
          <TabsTrigger value="ai-analysis" data-testid="tab-ai-analysis">
            <Sparkles className="h-4 w-4 mr-2" />
            AI Analysis
          </TabsTrigger>
          <TabsTrigger value="notes" data-testid="tab-notes">
            <Users className="h-4 w-4 mr-2" />
            Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="transcript" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Call Transcript</CardTitle>
                {lead.recordingUrl && !lead.transcript && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => transcribeMutation.mutate()}
                    disabled={transcribeMutation.isPending || lead.transcriptionStatus === 'processing'}
                    data-testid="button-transcribe"
                  >
                    {lead.transcriptionStatus === 'processing' ? 'Processing...' : 'Generate Transcript'}
                  </Button>
                )}
              </div>
              {lead.transcriptionStatus && (
                <CardDescription>Status: {lead.transcriptionStatus}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {lead.transcript ? (
                <div className="prose dark:prose-invert max-w-none">
                  <p className="whitespace-pre-wrap text-sm" data-testid="text-transcript">
                    {lead.transcript}
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No transcript available. {lead.recordingUrl && 'Click "Generate Transcript" to create one.'}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ai-analysis" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>AI Qualification Analysis</CardTitle>
                {lead.transcript && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => analyzeMutation.mutate()}
                    disabled={analyzeMutation.isPending}
                    data-testid="button-analyze"
                  >
                    {analyzeMutation.isPending ? 'Analyzing...' : lead.aiAnalysis ? 'Re-run AI Analysis' : 'Run AI Analysis'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {lead.aiQualificationStatus && (
                <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                  <div>
                    <p className="text-sm text-muted-foreground">Qualification Status</p>
                    <div className="mt-1">
                      {getQualificationBadge(lead.aiQualificationStatus)}
                    </div>
                  </div>
                  {lead.aiScore && (
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">AI Score</p>
                      <p className="text-3xl font-bold" data-testid="text-ai-score">
                        {Number(lead.aiScore).toFixed(0)}
                        <span className="text-lg text-muted-foreground">/100</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
              
              {/* Detailed AI Insights - Show when review is needed */}
              {lead.qaData && (lead.qaData as any).ai_analysis && (
                <div className="space-y-4">
                  {/* Show detailed insights when needs review or score < 70 */}
                  {((lead.aiQualificationStatus === 'needs_review' || (lead.aiScore && lead.aiScore < 70))) && (
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                      <div className="flex items-center gap-2 mb-3">
                        <Sparkles className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                        <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">AI Review Insights</p>
                      </div>

                      {/* Missing Information */}
                      {(lead.qaData as any).ai_analysis.missing_info && (lead.qaData as any).ai_analysis.missing_info.length > 0 && (
                        <div className="mb-4">
                          <p className="text-sm font-semibold mb-2 text-yellow-900 dark:text-yellow-100">Missing Information</p>
                          <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800 dark:text-yellow-200">
                            {(lead.qaData as any).ai_analysis.missing_info.map((info: string, idx: number) => (
                              <li key={idx}>{info}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Recommendations */}
                      {(lead.qaData as any).ai_analysis.recommendations && (lead.qaData as any).ai_analysis.recommendations.length > 0 && (
                        <div>
                          <p className="text-sm font-semibold mb-2 text-yellow-900 dark:text-yellow-100">Recommended Actions</p>
                          <ul className="list-disc list-inside space-y-1 text-sm text-yellow-800 dark:text-yellow-200">
                            {(lead.qaData as any).ai_analysis.recommendations.map((rec: string, idx: number) => (
                              <li key={idx}>{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Detailed Scoring Analysis - Show for all analyzed leads */}
                  {(lead.qaData as any).ai_analysis.analysis && (
                    <div className="p-4 bg-card border rounded-lg">
                      <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Detailed Scoring Analysis
                      </p>
                      <div className="space-y-3">
                        {Object.entries((lead.qaData as any).ai_analysis.analysis).map(([criterion, data]: [string, any]) => (
                          <div key={criterion} className="space-y-1 pb-3 border-b last:border-0">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-medium capitalize">
                                {criterion.replace(/_/g, ' ')}
                              </p>
                              <Badge 
                                variant={data.score >= 70 ? 'outline' : data.score >= 40 ? 'secondary' : 'destructive'}
                                className={
                                  data.score >= 70 
                                    ? 'text-xs bg-green-50 text-green-700 border-green-300 dark:bg-green-900/20 dark:text-green-400 dark:border-green-700'
                                    : data.score >= 40 
                                    ? 'text-xs bg-yellow-50 text-yellow-700 border-yellow-300 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-700'
                                    : 'text-xs'
                                }
                              >
                                {data.score}/100
                              </Badge>
                            </div>
                            {data.evidence && (
                              <p className="text-xs text-muted-foreground italic">
                                "{data.evidence}"
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Custom QA Data Display */}
              {lead.qaData && Object.keys(lead.qaData).filter(k => k !== 'ai_analysis').length > 0 && (
                <div className="p-4 bg-card border rounded-lg">
                  <p className="text-sm font-semibold mb-3">Custom Qualification Data</p>
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(lead.qaData).filter(([key]) => key !== 'ai_analysis').map(([key, value]) => (
                      <div key={key} className="space-y-1" data-testid={`qa-data-${key}`}>
                        <p className="text-xs text-muted-foreground capitalize">
                          {key.replace(/_/g, ' ')}
                        </p>
                        <p className="text-sm font-medium">
                          {typeof value === 'boolean' 
                            ? (value ? 'Yes' : 'No')
                            : typeof value === 'object' && value !== null
                              ? JSON.stringify(value)
                              : String(value || 'N/A')}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {lead.aiAnalysis ? (
                <div className="space-y-3">
                  {typeof lead.aiAnalysis === 'object' && (
                    <>
                      {(lead.aiAnalysis as any).summary && (
                        <div>
                          <p className="text-sm font-semibold mb-1">Summary</p>
                          <p className="text-sm text-muted-foreground">{(lead.aiAnalysis as any).summary}</p>
                        </div>
                      )}
                      {(lead.aiAnalysis as any).keyPoints && Array.isArray((lead.aiAnalysis as any).keyPoints) && (
                        <div>
                          <p className="text-sm font-semibold mb-2">Key Points</p>
                          <ul className="list-disc list-inside space-y-1">
                            {(lead.aiAnalysis as any).keyPoints.map((point: string, index: number) => (
                              <li key={index} className="text-sm text-muted-foreground">{point}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No AI analysis available. {lead.transcript && 'Click "Run AI Analysis" to generate insights.'}
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>QA Notes</CardTitle>
                {!editingNotes && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditingNotes(true);
                      setNotesText(lead.notes || '');
                    }}
                    data-testid="button-edit-notes"
                  >
                    Edit Notes
                  </Button>
                )}
              </div>
              <CardDescription>
                Add quality assurance notes and observations for this lead
              </CardDescription>
            </CardHeader>
            <CardContent>
              {editingNotes ? (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="notes-textarea">Notes</Label>
                    <Textarea
                      id="notes-textarea"
                      value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                      placeholder="Enter QA notes, observations, or feedback..."
                      rows={8}
                      data-testid="input-notes"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingNotes(false);
                        setNotesText('');
                      }}
                      data-testid="button-cancel-notes"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => updateNotesMutation.mutate(notesText)}
                      disabled={updateNotesMutation.isPending}
                      data-testid="button-save-notes"
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {updateNotesMutation.isPending ? 'Saving...' : 'Save Notes'}
                    </Button>
                  </div>
                </div>
              ) : lead.notes ? (
                <p className="whitespace-pre-wrap text-sm" data-testid="text-notes">
                  {lead.notes}
                </p>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No notes available. Click "Edit Notes" to add QA observations.
                </p>
              )}
              {lead.rejectedReason && (
                <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                  <p className="text-sm font-semibold text-destructive mb-1">Rejection Reason</p>
                  <p className="text-sm text-destructive/90" data-testid="text-rejection-reason">
                    {lead.rejectedReason}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Lead</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this lead.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter rejection reason..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            data-testid="input-reject-reason"
          />
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setRejectDialogOpen(false)}
              data-testid="button-cancel-reject"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => rejectMutation.mutate(rejectReason)}
              disabled={!rejectReason || rejectMutation.isPending}
              data-testid="button-confirm-reject"
            >
              Reject Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent data-testid="dialog-delete-lead">
          <DialogHeader>
            <DialogTitle>Delete Lead</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this lead? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              variant="destructive"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Delete Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}