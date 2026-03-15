import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, XCircle, AlertCircle, Mail, BarChart3, Filter, X, Trash2, Sparkles, Download, Edit3, Upload, HelpCircle, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useExportAuthority } from "@/hooks/use-export-authority";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { renderEmailStatusBadge } from "@/lib/email-status";
import { EnrichmentProgress } from "@/components/EnrichmentProgress";
import type { VerificationEnrichmentJob } from "@shared/schema";

export default function VerificationConsolePage() {
  const { campaignId } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { canExportData } = useExportAuthority();
  const [currentContactId, setCurrentContactId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState<{ id: string; name: string; accountId?: string; accountName?: string } | null>(null);
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkDeleteReason, setBulkDeleteReason] = useState("");
  const [bulkFieldUpdateDialogOpen, setBulkFieldUpdateDialogOpen] = useState(false);
  const [bulkUpdateFieldName, setBulkUpdateFieldName] = useState("");
  const [bulkUpdateFieldValue, setBulkUpdateFieldValue] = useState("");
  const [enrichmentDialogOpen, setEnrichmentDialogOpen] = useState(false);
  const [activeEnrichmentJobId, setActiveEnrichmentJobId] = useState<string | null>(null);
  const [forceReenrich, setForceReenrich] = useState(false);
  const [validationJobId, setValidationJobId] = useState<string | null>(null);
  const [validationProgress, setValidationProgress] = useState<any>(null);
  const [validationUploadOpen, setValidationUploadOpen] = useState(false);
  const [validationUploadFile, setValidationUploadFile] = useState<File | null>(null);
  const [validationUploadResults, setValidationUploadResults] = useState<any>(null);
  const [submissionUploadOpen, setSubmissionUploadOpen] = useState(false);
  const [submissionUploadFile, setSubmissionUploadFile] = useState<File | null>(null);
  const [submissionUploadResults, setSubmissionUploadResults] = useState<any>(null);
  const [emailValidationDialogOpen, setEmailValidationDialogOpen] = useState(false);
  const [emailValidationLimit, setEmailValidationLimit] = useState(2500);
  const [activeEmailValidationJobId, setActiveEmailValidationJobId] = useState<string | null>(null);
  const [emailValidationJobProgress, setEmailValidationJobProgress] = useState<any>(null);
  const [filters, setFilters] = useState({
    contactSearch: "",
    phoneSearch: "",
    companySearch: "",
    sourceType: "",
    country: "",
    eligibilityStatus: "",
    emailStatus: "",
    verificationStatus: "",
    hasPhone: "",
    hasAddress: "",
    hasCav: "",
  });

  const updateFilters = (newFilters: typeof filters) => {
    setFilters(newFilters);
    setSelectedContactIds(new Set<string>());
  };

  const { data: campaign } = useQuery({
    queryKey: ["/api/verification-campaigns", campaignId],
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/verification-campaigns", campaignId, "stats"],
    refetchInterval: 30000, // Increased from 10s to 30s
    refetchIntervalInBackground: false,
  });

  // Query enrichment jobs to detect active jobs
  const { data: enrichmentJobsData, error: enrichmentJobsError } = useQuery<{ jobs: VerificationEnrichmentJob[] }>({
    queryKey: ['/api/campaigns', campaignId, 'enrichment-jobs'],
    enabled: !!campaignId,
  });

  // Auto-detect active enrichment job on page load (only pending/processing, not completed/failed/cancelled)
  useEffect(() => {
    if (enrichmentJobsData?.jobs) {
      const activeJob = enrichmentJobsData.jobs.find((j) => 
        j.status === 'pending' || j.status === 'processing'
      );
      if (activeJob && !activeEnrichmentJobId) {
        setActiveEnrichmentJobId(activeJob.id);
      } else if (!activeJob && activeEnrichmentJobId) {
        // Clear active job if no longer active (e.g., completed/failed/cancelled)
        setActiveEnrichmentJobId(null);
      }
    }
  }, [enrichmentJobsData, activeEnrichmentJobId]);

  // Show error toast if enrichment jobs query fails
  useEffect(() => {
    if (enrichmentJobsError) {
      toast({
        title: "Failed to Load Enrichment Jobs",
        description: "Unable to check for active enrichment jobs. Progress may not display correctly.",
        variant: "destructive",
      });
    }
  }, [enrichmentJobsError, toast]);

  // Poll email validation job status
  useEffect(() => {
    if (!activeEmailValidationJobId || !campaignId) return;

    const pollJobStatus = async () => {
      try {
        const res = await fetch(
          `/api/verification-campaigns/${campaignId}/email-validation-jobs/${activeEmailValidationJobId}`,
          {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('authToken')}`,
            },
            credentials: "include",
          }
        );
        if (!res.ok) throw new Error("Failed to fetch job status");
        const data = await res.json();
        setEmailValidationJobProgress(data);

        if (data.status === 'completed' || data.status === 'failed') {
          setActiveEmailValidationJobId(null);
          queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
          queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "queue"] });
          
          if (data.status === 'completed') {
            toast({
              title: "Email Validation Complete",
              description: `Validated ${data.processedContacts} contacts. Valid: ${data.validCount || 0}, Invalid: ${data.invalidCount || 0}`,
            });
          } else {
            toast({
              title: "Email Validation Failed",
              description: data.errorMessage || "An error occurred during validation",
              variant: "destructive",
            });
          }
        }
      } catch (error) {
        console.error("Failed to poll job status:", error);
      }
    };

    const interval = setInterval(pollJobStatus, 3000);
    pollJobStatus(); // Initial poll
    return () => clearInterval(interval);
  }, [activeEmailValidationJobId, campaignId, toast]);

  const { data: queue, isLoading: queueLoading } = useQuery({
    queryKey: ["/api/verification-campaigns", campaignId, "queue", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.contactSearch) params.append("contactSearch", filters.contactSearch);
      if (filters.phoneSearch) params.append("phoneSearch", filters.phoneSearch);
      if (filters.companySearch) params.append("companySearch", filters.companySearch);
      if (filters.sourceType) params.append("sourceType", filters.sourceType);
      if (filters.country) params.append("country", filters.country);
      if (filters.eligibilityStatus) params.append("eligibilityStatus", filters.eligibilityStatus);
      if (filters.emailStatus) params.append("emailStatus", filters.emailStatus);
      if (filters.verificationStatus) params.append("verificationStatus", filters.verificationStatus);
      if (filters.hasPhone) params.append("hasPhone", filters.hasPhone);
      if (filters.hasAddress) params.append("hasAddress", filters.hasAddress);
      if (filters.hasCav) params.append("hasCav", filters.hasCav);
      
      const url = `/api/verification-campaigns/${campaignId}/queue?${params.toString()}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch queue");
      return res.json();
    },
    enabled: !currentContactId,
  });

  const { data: allIds, refetch: fetchAllIds } = useQuery({
    queryKey: ["/api/verification-campaigns", campaignId, "queue/all-ids", filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.contactSearch) params.append("contactSearch", filters.contactSearch);
      if (filters.phoneSearch) params.append("phoneSearch", filters.phoneSearch);
      if (filters.companySearch) params.append("companySearch", filters.companySearch);
      if (filters.sourceType) params.append("sourceType", filters.sourceType);
      if (filters.country) params.append("country", filters.country);
      if (filters.eligibilityStatus) params.append("eligibilityStatus", filters.eligibilityStatus);
      if (filters.emailStatus) params.append("emailStatus", filters.emailStatus);
      if (filters.verificationStatus) params.append("verificationStatus", filters.verificationStatus);
      if (filters.hasPhone) params.append("hasPhone", filters.hasPhone);
      if (filters.hasAddress) params.append("hasAddress", filters.hasAddress);
      if (filters.hasCav) params.append("hasCav", filters.hasCav);
      
      const url = `/api/verification-campaigns/${campaignId}/queue/all-ids?${params.toString()}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('authToken')}`,
        },
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch all IDs");
      return res.json();
    },
    enabled: false,
  });

  const { data: contact } = useQuery({
    queryKey: ["/api/verification-contacts", currentContactId],
    enabled: !!currentContactId,
  });

  const { data: accountCap } = useQuery({
    queryKey: ["/api/verification-campaigns", campaignId, "accounts", (contact as any)?.account_name, "cap"],
    enabled: !!currentContactId && !!(contact as any)?.account_name,
  });

  const { data: associatedContacts = [] } = useQuery<any[]>({
    queryKey: ["/api/verification-contacts/account", (contact as any)?.account_id, { campaignId, includeSuppressed: true }],
    enabled: !!currentContactId && !!(contact as any)?.account_id && !!campaignId,
  });

  const updateMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", `/api/verification-contacts/${currentContactId}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contact updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/verification-contacts", currentContactId] });
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
    },
  });

  const elvMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/verification-contacts/${currentContactId}/validate-email`, undefined);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Email validated",
        description: `Status: ${data.emailStatus}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/verification-contacts", currentContactId] });
    },
    onError: (error: any) => {
      toast({
        title: "Validation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const singleContactEnrichmentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/verification-contacts/${currentContactId}/enrich`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Enrichment complete",
        description: `Address enriched: ${data.addressEnriched ? 'Yes' : 'No'}, Phone enriched: ${data.phoneEnriched ? 'Yes' : 'No'}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/verification-contacts", currentContactId] });
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Enrichment failed",
        description: error.message || "Failed to enrich company data",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const res = await apiRequest("DELETE", `/api/verification-contacts/${contactId}`, undefined);
      return res.json();
    },
    onSuccess: (_, contactId) => {
      toast({
        title: "Contact deleted",
        description: "Contact has been removed from the queue",
      });
      setCurrentContactId(null);
      setDeleteDialogOpen(false);
      setContactToDelete(null);
      
      queryClient.removeQueries({ queryKey: ["/api/verification-contacts", contactId] });
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
      
      if (contactToDelete?.accountId) {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/verification-contacts/account", contactToDelete.accountId, { campaignId }] 
        });
      }
      if (contactToDelete?.accountName) {
        queryClient.invalidateQueries({ 
          queryKey: ["/api/verification-campaigns", campaignId, "accounts", contactToDelete.accountName, "cap"] 
        });
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete contact",
        variant: "destructive",
      });
      setDeleteDialogOpen(false);
      setContactToDelete(null);
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async ({ contactIds, reason }: { contactIds: string[]; reason?: string }) => {
      const res = await apiRequest("POST", `/api/verification-campaigns/${campaignId}/contacts/bulk-delete`, { 
        contactIds, 
        reason 
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Bulk delete successful",
        description: `${data.deletedCount} contact(s) have been deleted`,
      });
      setSelectedContactIds(new Set());
      setBulkDeleteDialogOpen(false);
      setBulkDeleteReason("");
      
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Bulk delete failed",
        description: error.message || "Failed to delete contacts",
        variant: "destructive",
      });
    },
  });

  const queueEnrichmentMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/enrichment-jobs", {
        campaignId,
        force: forceReenrich,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      setActiveEnrichmentJobId(data.job.id);
      setEnrichmentDialogOpen(false);
      setForceReenrich(false);
      
      toast({
        title: "Enrichment Job Queued",
        description: `Processing ${data.job.totalContacts} contacts across ${data.job.totalAccounts} accounts`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'enrichment-jobs'] });
    },
    onError: (error: any) => {
      // Handle 409 Conflict - job already running
      if (error.status === 409) {
        toast({
          title: "Enrichment Already Running",
          description: "An enrichment job is already processing for this campaign",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Failed to Queue Enrichment",
          description: error.message || "Failed to start enrichment job",
          variant: "destructive",
        });
      }
    },
  });

  const bulkEmailValidationMutation = useMutation({
    mutationFn: async (contactIds: string[]) => {
      const res = await apiRequest("POST", `/api/verification-campaigns/${campaignId}/contacts/bulk-verify-emails`, { 
        contactIds 
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      const { jobId, totalContacts, totalBatches } = data;
      setValidationJobId(jobId);
      toast({
        title: "Email validation started",
        description: `Processing ${totalContacts} contact(s) in ${totalBatches} batch(es). Polling for progress...`,
        duration: 5000,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Bulk validation failed",
        description: error.message || "Failed to validate emails",
        variant: "destructive",
      });
    },
  });

  const bulkMarkValidatedMutation = useMutation({
    mutationFn: async (contactIds: string[]) => {
      const res = await apiRequest("POST", `/api/verification-campaigns/${campaignId}/contacts/bulk-mark-validated`, { 
        contactIds 
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Bulk mark validated complete",
        description: `${data.updatedCount} contact(s) marked as validated`,
      });
      setSelectedContactIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Bulk mark validated failed",
        description: error.message || "Failed to mark contacts as validated",
        variant: "destructive",
      });
    },
  });

  const bulkFieldUpdateMutation = useMutation({
    mutationFn: async ({ contactIds, fieldName, fieldValue }: { contactIds: string[]; fieldName: string; fieldValue: any }) => {
      const res = await apiRequest("POST", `/api/verification-campaigns/${campaignId}/contacts/bulk-field-update`, { 
        contactIds,
        fieldName,
        fieldValue
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Bulk field update complete",
        description: `${data.updatedCount} contact(s) updated`,
      });
      setSelectedContactIds(new Set());
      setBulkFieldUpdateDialogOpen(false);
      setBulkUpdateFieldName("");
      setBulkUpdateFieldValue("");
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Bulk field update failed",
        description: error.message || "Failed to update field",
        variant: "destructive",
      });
    },
  });

  const startEmailValidationMutation = useMutation({
    mutationFn: async (limit: number) => {
      const res = await apiRequest("POST", `/api/verification-campaigns/${campaignId}/start-email-validation`, { 
        limit,
        reservedOnly: true
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      if (data.jobId) {
        setActiveEmailValidationJobId(data.jobId);
        setEmailValidationDialogOpen(false);
        toast({
          title: "Email Validation Started",
          description: `Processing ${data.totalContacts} contacts (${data.totalSkipped} already validated). Estimated time: ~${data.estimatedTimeMinutes} minutes`,
        });
      } else {
        toast({
          title: "No Contacts to Validate",
          description: data.message || "All eligible contacts have already been validated",
        });
        setEmailValidationDialogOpen(false);
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Start Validation",
        description: error.message || "Failed to start email validation",
        variant: "destructive",
      });
    },
  });

  const bulkEnrichmentMutation = useMutation({
    mutationFn: async (contactIds: string[]) => {
      const res = await apiRequest("POST", `/api/verification-campaigns/${campaignId}/contacts/bulk-enrich`, { 
        contactIds 
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Bulk enrichment complete",
        description: `Enriched ${data.addressEnriched} addresses and ${data.phoneEnriched} phone numbers`,
      });
      setSelectedContactIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "queue"] });
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Bulk enrichment failed",
        description: error.message || "Failed to enrich contacts",
        variant: "destructive",
      });
    },
  });

  useEffect(() => {
    if (!validationJobId) return;
    
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/verification-campaigns/${campaignId}/email-validation-jobs/${validationJobId}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          },
          credentials: "include",
        });
        
        if (!res.ok) {
          throw new Error("Failed to fetch job status");
        }
        
        const job = await res.json();
        setValidationProgress(job);
        
        if (job.status === 'completed') {
          clearInterval(pollInterval);
          toast({
            title: "Email Verification Complete",
            description: `Verified ${job.successCount} contacts: ${job.statusCounts?.valid || 0} Valid, ${job.statusCounts?.acceptable || 0} Acceptable, ${job.statusCounts?.invalid || 0} Invalid, ${job.statusCounts?.unknown || 0} Unknown`,
            duration: 10000,
          });
          setValidationJobId(null);
          setValidationProgress(null);
          setSelectedContactIds(new Set());
          queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "queue"] });
          queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
        } else if (job.status === 'failed') {
          clearInterval(pollInterval);
          toast({ 
            title: "Validation failed", 
            description: job.errorMessage || "Email validation job failed", 
            variant: "destructive" 
          });
          setValidationJobId(null);
          setValidationProgress(null);
        }
      } catch (error: any) {
        console.error("Polling error:", error);
        clearInterval(pollInterval);
        toast({
          title: "Polling error",
          description: error.message || "Failed to check validation status",
          variant: "destructive",
        });
        setValidationJobId(null);
        setValidationProgress(null);
      }
    }, 2000);
    
    return () => clearInterval(pollInterval);
  }, [validationJobId, campaignId, toast]);

  const loadNextContact = () => {
    if ((queue as any)?.data && (queue as any).data.length > 0) {
      setCurrentContactId((queue as any).data[0].id);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked && (queue as any)?.data) {
      const allIds = new Set<string>((queue as any).data.map((c: any) => c.id as string));
      setSelectedContactIds(allIds);
    } else {
      setSelectedContactIds(new Set<string>());
    }
  };

  const handleSelectAllRecords = async () => {
    const result = await fetchAllIds();
    if (result.data?.ids) {
      setSelectedContactIds(new Set<string>(result.data.ids));
      toast({
        title: "All records selected",
        description: `${result.data.total} eligible contact(s) selected for bulk operation`,
      });
    }
  };

  const handleSelectContact = (contactId: string, checked: boolean) => {
    const newSelection = new Set(selectedContactIds);
    if (checked) {
      newSelection.add(contactId);
    } else {
      newSelection.delete(contactId);
    }
    setSelectedContactIds(newSelection);
  };

  const handleBulkDelete = () => {
    if (selectedContactIds.size === 0) return;
    setBulkDeleteDialogOpen(true);
  };

  const confirmBulkDelete = () => {
    if (selectedContactIds.size === 0) return;
    bulkDeleteMutation.mutate({ 
      contactIds: Array.from(selectedContactIds), 
      reason: bulkDeleteReason || "Bulk delete via console" 
    });
  };

  const handleEnrichCompanyData = () => {
    queueEnrichmentMutation.mutate();
  };

  const handleBulkEmailValidation = () => {
    if (selectedContactIds.size === 0) return;
    bulkEmailValidationMutation.mutate(Array.from(selectedContactIds));
  };

  const handleBulkEnrichment = () => {
    if (selectedContactIds.size === 0) return;
    bulkEnrichmentMutation.mutate(Array.from(selectedContactIds));
  };

  const handleBulkMarkValidated = () => {
    if (selectedContactIds.size === 0) return;
    bulkMarkValidatedMutation.mutate(Array.from(selectedContactIds));
  };

  const handleBulkFieldUpdate = () => {
    if (selectedContactIds.size === 0) return;
    setBulkFieldUpdateDialogOpen(true);
  };

  const confirmBulkFieldUpdate = () => {
    if (selectedContactIds.size === 0 || !bulkUpdateFieldName || bulkUpdateFieldValue === "") return;
    bulkFieldUpdateMutation.mutate({
      contactIds: Array.from(selectedContactIds),
      fieldName: bulkUpdateFieldName,
      fieldValue: bulkUpdateFieldValue
    });
  };

  const handleSaveAndNext = async () => {
    await updateMutation.mutateAsync({
      verificationStatus: "Validated",
    });
    setCurrentContactId(null);
    queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "queue"] });
  };

  const okRate = stats ? (Number((stats as any).ok_email_count) / Math.max(1, Number((stats as any).validated_count))) : 0;
  const deliverability = stats ? 1 - (Number((stats as any).invalid_email_count) / Math.max(1, Number((stats as any).validated_count))) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/verification/campaigns")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              {(campaign as any)?.name || "Verification Console"}
            </h1>
            <p className="text-muted-foreground mt-1" data-testid="text-page-description">
              Data verification and enrichment workstation
            </p>
          </div>
        </div>
        <Button
          onClick={() => setEnrichmentDialogOpen(true)}
          disabled={queueEnrichmentMutation.isPending || !!activeEnrichmentJobId}
          data-testid="button-enrich"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {queueEnrichmentMutation.isPending ? "Queueing..." : activeEnrichmentJobId ? "Enrichment Running" : "Enrich Company Data"}
        </Button>
      </div>

      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Eligible (Total)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="text-eligible-count">
              {(stats as any)?.eligible_count || 0}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              <span className="text-green-600">✓ {(stats as any)?.eligible_unsuppressed_count || 0} Active</span>
              {" • "}
              <span className="text-destructive">✗ {(stats as any)?.eligible_suppressed_count || 0} Suppressed</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Validated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold" data-testid="text-validated-count">
                {(stats as any)?.validated_count || 0}
              </div>
              {(stats as any)?.validated_count > 0 && (stats as any)?.ok_email_count === 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={async () => {
                    try {
                      const res = await fetch(
                        `/api/verification-campaigns/${campaignId}/contacts/run-email-validation`,
                        {
                          method: "POST",
                          headers: {
                            "Authorization": `Bearer ${localStorage.getItem('authToken')}`,
                          },
                          credentials: "include",
                        }
                      );
                      const data = await res.json();
                      toast({
                        title: "Email Validation Started",
                        description: `Processing ${data.total || 0} contacts...`,
                      });
                      // Refresh stats after a delay
                      setTimeout(() => {
                        queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
                      }, 2000);
                    } catch (error) {
                      toast({
                        title: "Error",
                        description: "Failed to start email validation",
                        variant: "destructive",
                      });
                    }
                  }}
                  data-testid="button-run-email-validation"
                >
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Validate Emails
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">OK Email Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold" data-testid="text-ok-rate">
                {(okRate * 100).toFixed(1)}%
              </div>
              <Progress value={okRate * 100} className="h-2" />
              <div className="text-xs text-muted-foreground">
                Target: {Number((campaign as any)?.okRateTarget || 0.95) * 100}%
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Deliverability</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold" data-testid="text-deliverability-rate">
                {(deliverability * 100).toFixed(1)}%
              </div>
              <Progress value={deliverability * 100} className="h-2" />
              <div className="text-xs text-muted-foreground">
                Target: {Number((campaign as any)?.deliverabilityTarget || 0.97) * 100}%
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Submissions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="text-2xl font-bold" data-testid="text-submission-count">
                {(stats as any)?.submission_count || 0}
              </div>
              <Progress
                value={(Number((stats as any)?.submission_count || 0) / ((campaign as any)?.monthlyTarget || 1000)) * 100}
                className="h-2"
              />
              <div className="text-xs text-muted-foreground">
                of {(campaign as any)?.monthlyTarget || 0} target
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Show enrichment progress when job is active */}
      {activeEnrichmentJobId && (
        <EnrichmentProgress
          jobId={activeEnrichmentJobId}
          campaignId={campaignId!}
          onComplete={() => {
            setActiveEnrichmentJobId(null);
            queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'enrichment-jobs'] });
            queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
            queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "queue"] });
          }}
        />
      )}

      {/* Email Validation Progress */}
      {activeEmailValidationJobId && emailValidationJobProgress && (
        <Card className="border-primary">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email Validation in Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Progress 
                value={emailValidationJobProgress.progressPercent || 0} 
                className="h-2"
              />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>
                  {emailValidationJobProgress.processedContacts || 0} / {emailValidationJobProgress.totalContacts || 0} contacts
                </span>
                <span>{emailValidationJobProgress.progressPercent || 0}%</span>
              </div>
              {emailValidationJobProgress.validCount !== undefined && (
                <div className="flex gap-4 text-xs">
                  <span className="text-green-600">Valid: {emailValidationJobProgress.validCount}</span>
                  <span className="text-red-600">Invalid: {emailValidationJobProgress.invalidCount || 0}</span>
                  <span className="text-yellow-600">Risky: {emailValidationJobProgress.riskyCount || 0}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Submission Manager - Built-in Validation Workflow */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Submission Manager</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Built-in email validation and client delivery workflow
              </p>
            </div>
            <Button
              onClick={() => setEmailValidationDialogOpen(true)}
              disabled={startEmailValidationMutation.isPending || !!activeEmailValidationJobId}
              data-testid="button-start-email-validation"
            >
              <Mail className="h-4 w-4 mr-2" />
              {activeEmailValidationJobId ? "Validation Running..." : "Start Email Validation"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-medium text-muted-foreground">Step 1: Review Eligible</h4>
              {canExportData && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    window.location.href = `/api/verification-campaigns/${campaignId}/contacts/export/validated-verified`;
                  }}
                  data-testid="button-export-for-validation"
                  className="w-full justify-start"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Eligible Contacts
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Download contacts with validated emails (auto-validated)
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-medium text-muted-foreground">Step 2: Lock for Delivery</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  try {
                    const res = await fetch(
                      `/api/verification-campaigns/${campaignId}/submission/prepare`,
                      {
                        method: "POST",
                        body: JSON.stringify({ batchSize: 500 }),
                        headers: { 
                          "Content-Type": "application/json",
                          "Authorization": `Bearer ${localStorage.getItem('authToken')}`,
                        },
                        credentials: "include",
                      }
                    );
                    const data = await res.json();
                    toast({
                      title: "Buffer Prepared",
                      description: `${data.buffered} contacts locked for delivery`,
                    });
                    queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
                  } catch (error) {
                    toast({
                      title: "Error",
                      description: "Failed to prepare submission buffer",
                      variant: "destructive",
                    });
                  }
                }}
                data-testid="button-prepare-buffer"
                className="w-full justify-start"
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Lock Validated Contacts
              </Button>
              <p className="text-xs text-muted-foreground">
                Lock contacts with validated emails for delivery
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-medium text-muted-foreground">Step 3: Export for Client</h4>
              {canExportData && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    window.location.href = `/api/verification-campaigns/${campaignId}/submission/export?template=enriched`;
                  }}
                  data-testid="button-export-for-client"
                  className="w-full justify-start"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Export Buffered Leads
                </Button>
              )}
              <p className="text-xs text-muted-foreground">
                Download final leads for client delivery
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <h4 className="text-sm font-medium text-muted-foreground">Step 4: Clear Buffer</h4>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!confirm("Clear submission buffer? This will unlock all contacts for the next batch.")) return;
                  try {
                    await fetch(`/api/verification-campaigns/${campaignId}/flush`, {
                      method: "POST",
                      headers: {
                        "Authorization": `Bearer ${localStorage.getItem('authToken')}`,
                      },
                      credentials: "include",
                    });
                    toast({
                      title: "Buffer Cleared",
                      description: "Submission buffer has been reset",
                    });
                    queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
                  } catch (error) {
                    toast({
                      title: "Error",
                      description: "Failed to clear buffer",
                      variant: "destructive",
                    });
                  }
                }}
                data-testid="button-clear-buffer"
                className="w-full justify-start"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Clear Buffer
              </Button>
              <p className="text-xs text-muted-foreground">
                Reset buffer after client delivery
              </p>
            </div>
          </div>

          <div className="mt-4 p-3 bg-muted/50 rounded-md border">
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium mb-1">Built-in Email Validation</p>
                <p className="text-xs text-muted-foreground">
                  <strong>Automatic Workflow:</strong> Contacts are validated in the background using built-in DNS/MX verification → 
                  Export eligible contacts → Lock for delivery → Export for client → Clear buffer
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setValidationUploadOpen(true);
                    setValidationUploadResults(null);
                  }}
                  data-testid="button-upload-validation-results"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload External Validation (Optional)
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSubmissionUploadOpen(true);
                    setSubmissionUploadResults(null);
                  }}
                  data-testid="button-upload-submission-records"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Submission Records
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                💡 <strong>Tip:</strong> Email validation now runs automatically in the background. You can still upload external validation results if needed.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {!currentContactId ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Verification Queue</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {queueLoading ? "Loading..." : `${(queue as any)?.total || 0} contacts ready for verification`}
                </p>
              </div>
              <div className="flex gap-2">
                {canExportData && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      window.location.href = `/api/verification-campaigns/${campaignId}/contacts/export/validated-verified`;
                    }}
                    data-testid="button-export-validated-verified"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export Validated+Verified
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowFilters(!showFilters)}
                  data-testid="button-toggle-filters"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  {showFilters ? "Hide" : "Show"} Filters
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {showFilters && (
              <div className="mb-4 p-4 border rounded-md bg-muted/50 space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <Label className="text-xs">Contact Search</Label>
                    <Input
                      placeholder="Name or email..."
                      value={filters.contactSearch}
                      onChange={(e) => updateFilters({ ...filters, contactSearch: e.target.value })}
                      data-testid="input-contact-search"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Phone Search</Label>
                    <Input
                      placeholder="Phone number..."
                      value={filters.phoneSearch}
                      onChange={(e) => updateFilters({ ...filters, phoneSearch: e.target.value })}
                      data-testid="input-phone-search"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Company Search</Label>
                    <Input
                      placeholder="Company name..."
                      value={filters.companySearch}
                      onChange={(e) => updateFilters({ ...filters, companySearch: e.target.value })}
                      data-testid="input-company-search"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Country</Label>
                    <Input
                      placeholder="e.g. Vietnam"
                      value={filters.country}
                      onChange={(e) => updateFilters({ ...filters, country: e.target.value })}
                      data-testid="input-country"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Source Type</Label>
                    <Select
                      value={filters.sourceType || "all"}
                      onValueChange={(value) => updateFilters({ ...filters, sourceType: value === "all" ? "" : value })}
                    >
                      <SelectTrigger data-testid="select-source-type">
                        <SelectValue placeholder="All sources" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All sources</SelectItem>
                        <SelectItem value="Client_Provided">Client Provided</SelectItem>
                        <SelectItem value="New_Sourced">New Sourced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Eligibility Status</Label>
                    <Select
                      value={filters.eligibilityStatus || "all"}
                      onValueChange={(value) => updateFilters({ ...filters, eligibilityStatus: value === "all" ? "" : value })}
                    >
                      <SelectTrigger data-testid="select-eligibility-status">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="Eligible">Eligible</SelectItem>
                        <SelectItem value="Not_Eligible">Not Eligible</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Email Status</Label>
                    <Select
                      value={filters.emailStatus || "all"}
                      onValueChange={(value) => updateFilters({ ...filters, emailStatus: value === "all" ? "" : value })}
                    >
                      <SelectTrigger data-testid="select-email-status">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="valid">Valid</SelectItem>
                        <SelectItem value="acceptable">Acceptable</SelectItem>
                        <SelectItem value="unknown">Unknown</SelectItem>
                        <SelectItem value="invalid">Invalid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Verification Status</Label>
                    <Select
                      value={filters.verificationStatus || "all"}
                      onValueChange={(value) => updateFilters({ ...filters, verificationStatus: value === "all" ? "" : value })}
                    >
                      <SelectTrigger data-testid="select-verification-status">
                        <SelectValue placeholder="All statuses" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Validated">Validated</SelectItem>
                        <SelectItem value="Rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Has Phone</Label>
                    <Select
                      value={filters.hasPhone || "all"}
                      onValueChange={(value) => updateFilters({ ...filters, hasPhone: value === "all" ? "" : value })}
                    >
                      <SelectTrigger data-testid="select-has-phone">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Has Address</Label>
                    <Select
                      value={filters.hasAddress || "all"}
                      onValueChange={(value) => updateFilters({ ...filters, hasAddress: value === "all" ? "" : value })}
                    >
                      <SelectTrigger data-testid="select-has-address">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">CAV Status</Label>
                    <Select
                      value={filters.hasCav || "all"}
                      onValueChange={(value) => updateFilters({ ...filters, hasCav: value === "all" ? "" : value })}
                    >
                      <SelectTrigger data-testid="select-has-cav">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="yes">Has CAV</SelectItem>
                        <SelectItem value="no">No CAV</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {(filters.contactSearch || filters.phoneSearch || filters.companySearch || filters.sourceType || filters.country || filters.eligibilityStatus || filters.emailStatus || filters.verificationStatus || filters.hasPhone || filters.hasAddress || filters.hasCav)
                      ? "Filters active"
                      : "No filters applied"}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      updateFilters({ 
                        contactSearch: "", 
                        phoneSearch: "",
                        companySearch: "", 
                        sourceType: "", 
                        country: "", 
                        eligibilityStatus: "", 
                        emailStatus: "", 
                        verificationStatus: "",
                        hasPhone: "",
                        hasAddress: "",
                        hasCav: ""
                      });
                    }}
                    data-testid="button-clear-filters"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Clear All
                  </Button>
                </div>
              </div>
            )}
            {validationProgress && validationProgress.status === 'processing' && (
              <div className="mb-4 p-4 rounded-md border bg-blue-50 dark:bg-blue-950" data-testid="validation-progress">
                <p className="text-sm font-medium">Email Validation in Progress</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Batch {validationProgress.currentBatch}/{validationProgress.totalBatches} 
                  {" | "}
                  {validationProgress.processedContacts}/{validationProgress.totalContacts} contacts
                  {" | "}
                  {Math.round((validationProgress.processedContacts / validationProgress.totalContacts) * 100)}% complete
                </p>
                <Progress 
                  value={(validationProgress.processedContacts / validationProgress.totalContacts) * 100} 
                  className="h-2 mt-2" 
                />
              </div>
            )}
            <div className="mb-4 flex items-center justify-between gap-3">
              {(queue as any)?.data?.length === 50 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSelectAllRecords}
                  disabled={bulkDeleteMutation.isPending}
                  data-testid="button-select-all-records"
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Select All Records{allIds?.total ? ` (${allIds.total})` : ''}
                </Button>
              )}
              {selectedContactIds.size > 0 && (
                <div className="flex-1 p-3 border rounded-md bg-primary/10">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Badge variant="default" className="px-3 py-1">
                        {selectedContactIds.size} selected
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedContactIds(new Set())}
                        disabled={bulkDeleteMutation.isPending || bulkEmailValidationMutation.isPending || bulkEnrichmentMutation.isPending || bulkMarkValidatedMutation.isPending}
                        data-testid="button-clear-selection"
                      >
                        Clear Selection
                      </Button>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleBulkEmailValidation}
                        disabled={bulkEmailValidationMutation.isPending || bulkEnrichmentMutation.isPending || bulkMarkValidatedMutation.isPending || bulkDeleteMutation.isPending}
                        data-testid="button-bulk-email-validation"
                      >
                        <Mail className="h-4 w-4 mr-2" />
                        {bulkEmailValidationMutation.isPending ? "Validating..." : "Validate Emails"}
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleBulkEnrichment}
                        disabled={bulkEnrichmentMutation.isPending || bulkEmailValidationMutation.isPending || bulkMarkValidatedMutation.isPending || bulkDeleteMutation.isPending}
                        data-testid="button-bulk-enrichment"
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        {bulkEnrichmentMutation.isPending ? "Enriching..." : "Enrich Data"}
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        onClick={handleBulkMarkValidated}
                        disabled={bulkMarkValidatedMutation.isPending || bulkEmailValidationMutation.isPending || bulkEnrichmentMutation.isPending || bulkDeleteMutation.isPending || bulkFieldUpdateMutation.isPending}
                        data-testid="button-bulk-mark-validated"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        {bulkMarkValidatedMutation.isPending ? "Marking..." : "Mark Validated"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleBulkFieldUpdate}
                        disabled={bulkFieldUpdateMutation.isPending || bulkEmailValidationMutation.isPending || bulkEnrichmentMutation.isPending || bulkMarkValidatedMutation.isPending || bulkDeleteMutation.isPending}
                        data-testid="button-bulk-field-update"
                      >
                        <Edit3 className="h-4 w-4 mr-2" />
                        {bulkFieldUpdateMutation.isPending ? "Updating..." : "Update Field"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={handleBulkDelete}
                        disabled={bulkDeleteMutation.isPending || bulkEmailValidationMutation.isPending || bulkEnrichmentMutation.isPending || bulkMarkValidatedMutation.isPending || bulkFieldUpdateMutation.isPending}
                        data-testid="button-bulk-delete"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
            {queueLoading ? (
              <div className="text-muted-foreground" data-testid="text-loading">Loading queue...</div>
            ) : (queue as any)?.data && (queue as any).data.length > 0 ? (
              <div className="border rounded-md">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="w-12 p-3">
                        <Checkbox
                          checked={selectedContactIds.size === (queue as any).data.length && (queue as any).data.length > 0}
                          onCheckedChange={handleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      </th>
                      <th className="text-left p-3 text-sm font-medium">Name</th>
                      <th className="text-left p-3 text-sm font-medium">Title</th>
                      <th className="text-left p-3 text-sm font-medium">Company</th>
                      <th className="text-left p-3 text-sm font-medium">Email</th>
                      <th className="text-left p-3 text-sm font-medium">Email Status</th>
                      <th className="text-left p-3 text-sm font-medium">Phone</th>
                      <th className="text-left p-3 text-sm font-medium">City</th>
                      <th className="text-left p-3 text-sm font-medium">Country</th>
                      <th className="text-left p-3 text-sm font-medium">Source</th>
                      <th className="text-right p-3 text-sm font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(queue as any).data.map((contact: any, index: number) => (
                      <tr
                        key={contact.id}
                        className="border-b last:border-0 hover-elevate cursor-pointer"
                        onClick={() => setCurrentContactId(contact.id)}
                        data-testid={`row-contact-${index}`}
                      >
                        <td className="w-12 p-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedContactIds.has(contact.id)}
                            onCheckedChange={(checked) => handleSelectContact(contact.id, !!checked)}
                            data-testid={`checkbox-select-${index}`}
                          />
                        </td>
                        <td className="p-3 text-sm font-medium" data-testid={`text-name-${index}`}>
                          {contact.full_name || contact.fullName}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground" data-testid={`text-title-${index}`}>
                          {contact.title || "-"}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground" data-testid={`text-company-${index}`}>
                          {contact.account_name || "-"}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground" data-testid={`text-email-${index}`}>
                          {contact.email || "-"}
                        </td>
                        <td className="p-3" data-testid={`badge-email-status-${index}`}>
                          {renderEmailStatusBadge(contact.email_status || contact.emailStatus, 'sm')}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground" data-testid={`text-phone-${index}`}>
                          {contact.phone || "-"}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground" data-testid={`text-city-${index}`}>
                          {contact.contact_city || contact.contactCity || "-"}
                        </td>
                        <td className="p-3 text-sm text-muted-foreground" data-testid={`text-country-${index}`}>
                          {contact.contact_country || contact.contactCountry || "-"}
                        </td>
                        <td className="p-3" data-testid={`badge-source-${index}`}>
                          <Badge variant="outline" className="text-xs">
                            {contact.source_type || contact.sourceType}
                          </Badge>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex gap-2 justify-end">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCurrentContactId(contact.id);
                              }}
                              data-testid={`button-view-${index}`}
                            >
                              View Details
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                setContactToDelete({
                                  id: contact.id,
                                  name: contact.full_name || contact.fullName || "this contact",
                                  accountId: contact.account_id || contact.accountId,
                                  accountName: contact.account_name || contact.accountName,
                                });
                                setDeleteDialogOpen(true);
                              }}
                              disabled={deleteMutation.isPending}
                              data-testid={`button-delete-${index}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground" data-testid="text-queue-empty">
                <div className="text-lg font-medium mb-2">Queue is empty</div>
                <p className="text-sm">No contacts available for verification.</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
            {(contact as any)?.account_name && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Account Lead Cap</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        {(contact as any)?.account_name}
                      </span>
                      <span className="text-sm font-medium" data-testid="text-account-cap">
                        {(accountCap as any)?.submitted || 0} / {(campaign as any)?.leadCapPerAccount || 10}
                      </span>
                    </div>
                    <Progress
                      value={((accountCap as any)?.submitted || 0) / ((campaign as any)?.leadCapPerAccount || 10) * 100}
                      className="h-2"
                      data-testid="progress-account-cap"
                    />
                    {((accountCap as any)?.submitted || 0) >= ((campaign as any)?.leadCapPerAccount || 10) && (
                      <p className="text-xs text-destructive" data-testid="text-cap-reached">
                        Cap reached - cannot submit more leads for this account
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-2">
              <CardTitle>Contact & Company Information</CardTitle>
              <div className="flex gap-2">
                <Badge variant={((contact as any)?.eligibility_status || (contact as any)?.eligibilityStatus) === 'Eligible' ? 'default' : 'secondary'}>
                  {(contact as any)?.eligibility_status || (contact as any)?.eligibilityStatus}
                </Badge>
                {(contact as any)?.suppressed && <Badge variant="destructive">Suppressed</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h3 className="text-sm font-semibold mb-3">Contact Details</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Full Name</Label>
                    <Input value={(contact as any)?.full_name || (contact as any)?.fullName || ""} readOnly data-testid="input-full-name" />
                  </div>
                  <div>
                    <Label>First Name</Label>
                    <Input value={(contact as any)?.first_name || (contact as any)?.firstName || ""} readOnly data-testid="input-first-name" />
                  </div>
                  <div>
                    <Label>Last Name</Label>
                    <Input value={(contact as any)?.last_name || (contact as any)?.lastName || ""} readOnly data-testid="input-last-name" />
                  </div>
                  <div>
                    <Label>Title</Label>
                    <Input value={(contact as any)?.title || ""} readOnly data-testid="input-title" />
                  </div>
                  <div className="col-span-2">
                    <Label>Email</Label>
                    <div className="flex gap-2">
                      <Input value={(contact as any)?.email || ""} readOnly data-testid="input-email" className="flex-1" />
                      {renderEmailStatusBadge((contact as any)?.email_status || (contact as any)?.emailStatus, 'md')}
                    </div>
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={(contact as any)?.phone || ""} readOnly data-testid="input-phone" />
                  </div>
                  <div>
                    <Label>Mobile</Label>
                    <Input value={(contact as any)?.mobile || ""} readOnly data-testid="input-mobile" />
                  </div>
                  <div>
                    <Label>LinkedIn URL</Label>
                    <Input value={(contact as any)?.linkedin_url || (contact as any)?.linkedinUrl || ""} readOnly data-testid="input-linkedin" />
                  </div>
                  <div className="col-span-3">
                    <Label>Contact Address 1</Label>
                    <Input value={(contact as any)?.contact_address1 || (contact as any)?.contactAddress1 || ""} readOnly data-testid="input-contact-address1" />
                  </div>
                  <div className="col-span-3">
                    <Label>Contact Address 2</Label>
                    <Input value={(contact as any)?.contact_address2 || (contact as any)?.contactAddress2 || ""} readOnly data-testid="input-contact-address2" />
                  </div>
                  <div className="col-span-3">
                    <Label>Contact Address 3</Label>
                    <Input value={(contact as any)?.contact_address3 || (contact as any)?.contactAddress3 || ""} readOnly data-testid="input-contact-address3" />
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input value={(contact as any)?.contact_city || (contact as any)?.contactCity || ""} readOnly data-testid="input-city" />
                  </div>
                  <div>
                    <Label>State</Label>
                    <Input value={(contact as any)?.contact_state || (contact as any)?.contactState || ""} readOnly data-testid="input-state" />
                  </div>
                  <div>
                    <Label>Country</Label>
                    <Input value={(contact as any)?.contact_country || (contact as any)?.contactCountry || ""} readOnly data-testid="input-country" />
                  </div>
                  <div>
                    <Label>Postal Code</Label>
                    <Input value={(contact as any)?.contact_postal || (contact as any)?.contactPostal || ""} readOnly data-testid="input-postal" />
                  </div>
                  <div>
                    <Label>CAV ID</Label>
                    <Input value={(contact as any)?.cav_id || (contact as any)?.cavId || ""} readOnly data-testid="input-cav-id" />
                  </div>
                  <div>
                    <Label>CAV User ID</Label>
                    <Input value={(contact as any)?.cav_user_id || (contact as any)?.cavUserId || ""} readOnly data-testid="input-cav-user-id" />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3">Company Information</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <Label>Company Name</Label>
                    <Input value={(contact as any)?.account_name || ""} readOnly data-testid="input-company-name" />
                  </div>
                  <div>
                    <Label>Domain</Label>
                    <Input value={(contact as any)?.domain || ""} readOnly data-testid="input-domain" />
                  </div>
                  <div className="col-span-3">
                    <Label>HQ Phone (Enriched)</Label>
                    <Input value={(contact as any)?.hqPhone || (contact as any)?.main_phone || ""} readOnly data-testid="input-hq-phone" />
                  </div>
                </div>
              </div>

              {(contact as any)?.account_custom_fields && Object.keys((contact as any).account_custom_fields).length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3">Account Custom Fields</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries((contact as any).account_custom_fields).map(([key, value]) => (
                      <div key={key}>
                        <Label className="capitalize">
                          {key.replace(/_/g, ' ')}
                        </Label>
                        <Input 
                          value={typeof value === 'object' ? JSON.stringify(value) : String(value)} 
                          readOnly 
                          data-testid={`input-account-custom-${key}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3">Contact Address & Phone (Enriched)</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-3">
                    <Label>Phone</Label>
                    <Input value={(contact as any)?.direct_phone || (contact as any)?.directPhone || ""} readOnly data-testid="input-contact-phone" />
                  </div>
                  <div className="col-span-3">
                    <Label>Address 1</Label>
                    <Input value={(contact as any)?.contact_address1 || (contact as any)?.contactAddress1 || ""} readOnly data-testid="input-contact-address1" />
                  </div>
                  <div className="col-span-3">
                    <Label>Address 2</Label>
                    <Input value={(contact as any)?.contact_address2 || (contact as any)?.contactAddress2 || ""} readOnly data-testid="input-contact-address2" />
                  </div>
                  <div className="col-span-3">
                    <Label>Address 3</Label>
                    <Input value={(contact as any)?.contact_address3 || (contact as any)?.contactAddress3 || ""} readOnly data-testid="input-contact-address3" />
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input value={(contact as any)?.contact_city || (contact as any)?.contactCity || ""} readOnly data-testid="input-contact-city" />
                  </div>
                  <div>
                    <Label>State</Label>
                    <Input value={(contact as any)?.contact_state || (contact as any)?.contactState || ""} readOnly data-testid="input-contact-state" />
                  </div>
                  <div>
                    <Label>Postal Code</Label>
                    <Input value={(contact as any)?.contact_postal || (contact as any)?.contactPostal || ""} readOnly data-testid="input-contact-postal" />
                  </div>
                  <div className="col-span-3">
                    <Label>Country</Label>
                    <Input value={(contact as any)?.contact_country || (contact as any)?.contactCountry || ""} readOnly data-testid="input-contact-country" />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-sm font-semibold mb-3">Status & Metadata</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Source Type</Label>
                    <Input value={(contact as any)?.source_type || (contact as any)?.sourceType || ""} readOnly data-testid="input-source-type" />
                  </div>
                  <div>
                    <Label>Verification Status</Label>
                    <Input value={(contact as any)?.verification_status || (contact as any)?.verificationStatus || ""} readOnly data-testid="input-verification-status" />
                  </div>
                  <div>
                    <Label>QA Status</Label>
                    <Input value={(contact as any)?.qa_status || (contact as any)?.qaStatus || ""} readOnly data-testid="input-qa-status" />
                  </div>
                </div>
              </div>

              {((contact as any)?.custom_fields || (contact as any)?.customFields) && Object.keys((contact as any)?.custom_fields || (contact as any)?.customFields || {}).length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="text-sm font-semibold mb-3">Custom Fields</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {Object.entries((contact as any)?.custom_fields || (contact as any)?.customFields || {}).map(([key, value]) => (
                      <div key={key}>
                        <Label className="capitalize">
                          {key.replace(/_/g, ' ')}
                        </Label>
                        <Input 
                          value={typeof value === 'object' ? JSON.stringify(value) : String(value)} 
                          readOnly 
                          data-testid={`input-custom-${key}`}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(contact as any)?.suppressed && (
                <div className="p-3 bg-destructive/10 border border-destructive rounded-md">
                  <p className="text-sm text-destructive font-semibold">
                    ⚠️ This contact is suppressed and cannot be processed
                  </p>
                </div>
              )}

              {(contact as any)?.eligibility_status !== 'Eligible' && !(contact as any)?.suppressed && (
                <div className="p-3 bg-muted border rounded-md">
                  <p className="text-sm text-muted-foreground">
                    ℹ️ Not eligible: {(contact as any)?.eligibility_reason || 'Out of scope'}
                  </p>
                </div>
              )}

              <div className="flex gap-2 pt-4 border-t">
                <Button
                  onClick={() => elvMutation.mutate()}
                  disabled={
                    elvMutation.isPending ||
                    (contact as any)?.eligibility_status !== 'Eligible' ||
                    (contact as any)?.verification_status !== 'Validated' ||
                    (contact as any)?.suppressed === true ||
                    !(contact as any)?.email ||
                    ((contact as any)?.email_status || (contact as any)?.emailStatus) === 'ok'
                  }
                  data-testid="button-validate-email"
                  title={
                    (contact as any)?.suppressed
                      ? "Contact is suppressed"
                      : (contact as any)?.eligibility_status !== 'Eligible'
                      ? "Contact must be Eligible"
                      : (contact as any)?.verification_status !== 'Validated'
                      ? "Contact must be Validated first"
                      : !(contact as any)?.email
                      ? "No email address"
                      : ""
                  }
                >
                  <Mail className="h-4 w-4 mr-2" />
                  {elvMutation.isPending ? "Validating..." : "Validate Email"}
                </Button>
                <Button
                  onClick={() => singleContactEnrichmentMutation.mutate()}
                  disabled={
                    singleContactEnrichmentMutation.isPending ||
                    (contact as any)?.eligibility_status !== 'Eligible' ||
                    (contact as any)?.suppressed === true ||
                    !(contact as any)?.account_name
                  }
                  data-testid="button-enrich-contact"
                  title={
                    (contact as any)?.suppressed
                      ? "Contact is suppressed"
                      : (contact as any)?.eligibility_status !== 'Eligible'
                      ? "Contact must be Eligible"
                      : !(contact as any)?.account_name
                      ? "No company name available"
                      : ""
                  }
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  {singleContactEnrichmentMutation.isPending ? "Enriching..." : "Enrich Company"}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    setContactToDelete({
                      id: currentContactId!,
                      name: (contact as any)?.full_name || (contact as any)?.fullName || "this contact",
                      accountId: (contact as any)?.account_id || (contact as any)?.accountId,
                      accountName: (contact as any)?.account_name || (contact as any)?.accountName,
                    });
                    setDeleteDialogOpen(true);
                  }}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete-contact"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
                <div className="flex-1" />
                <Button
                  variant="outline"
                  onClick={() => setCurrentContactId(null)}
                  data-testid="button-skip"
                  disabled={(contact as any)?.suppressed}
                >
                  Skip
                </Button>
                <Button 
                  onClick={handleSaveAndNext} 
                  data-testid="button-save-next"
                  disabled={(contact as any)?.suppressed || (contact as any)?.eligibility_status !== 'Eligible'}
                >
                  Save & Next
                </Button>
              </div>
            </CardContent>
          </Card>

          {(contact as any)?.account_id && (
            <Card>
              <CardHeader>
                <CardTitle>Associated Contacts from {(contact as any)?.account_name}</CardTitle>
              </CardHeader>
              <CardContent>
                {associatedContacts.length > 0 ? (
                  <div className="space-y-2">
                    {associatedContacts.map((assocContact: any, index: number) => (
                      <div
                        key={assocContact.id}
                        className={`p-3 border rounded-md flex items-center justify-between ${
                          assocContact.id === currentContactId ? 'bg-accent' : 'hover-elevate'
                        } ${assocContact.deleted || assocContact.suppressed ? 'opacity-60' : ''}`}
                        data-testid={`contact-card-${index}`}
                      >
                        <div className="flex-1 grid grid-cols-4 gap-4">
                          <div>
                            <p className="text-sm font-medium">{assocContact.full_name || assocContact.fullName}</p>
                            <p className="text-xs text-muted-foreground">{assocContact.title || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Email</p>
                            <p className="text-sm">{assocContact.email || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Phone</p>
                            <p className="text-sm">{assocContact.phone || assocContact.mobile || "-"}</p>
                          </div>
                          <div className="flex gap-2">
                            <Badge variant="outline" className="text-xs">
                              {assocContact.verification_status || assocContact.verificationStatus}
                            </Badge>
                            {(assocContact.deleted || assocContact.suppressed) && (
                              <Badge variant="destructive" className="text-xs">
                                {assocContact.deleted ? 'Deleted' : 'Suppressed'}
                              </Badge>
                            )}
                          </div>
                        </div>
                        {assocContact.id !== currentContactId && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setCurrentContactId(assocContact.id)}
                            data-testid={`button-view-contact-${index}`}
                          >
                            View
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No other contacts found for this company.</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {contactToDelete?.name}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (contactToDelete) {
                  deleteMutation.mutate(contactToDelete.id);
                }
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Delete Contacts</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to delete {selectedContactIds.size} contact(s). This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4">
            <Label htmlFor="bulk-delete-reason">Reason (optional)</Label>
            <Input
              id="bulk-delete-reason"
              placeholder="e.g., Duplicate records, Invalid data..."
              value={bulkDeleteReason}
              onChange={(e) => setBulkDeleteReason(e.target.value)}
              data-testid="input-bulk-delete-reason"
              className="mt-2"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkDelete}
              disabled={bulkDeleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-bulk-delete"
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : `Delete ${selectedContactIds.size} Contact(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkFieldUpdateDialogOpen} onOpenChange={setBulkFieldUpdateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bulk Update Field</AlertDialogTitle>
            <AlertDialogDescription>
              Update a field value for {selectedContactIds.size} selected contact(s).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="field-name">Field to Update</Label>
              <Select 
                value={bulkUpdateFieldName} 
                onValueChange={setBulkUpdateFieldName}
              >
                <SelectTrigger id="field-name" data-testid="select-field-name" className="mt-2">
                  <SelectValue placeholder="Select field" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contactCountry">Contact Country</SelectItem>
                  <SelectItem value="contactCity">Contact City</SelectItem>
                  <SelectItem value="contactState">Contact State/Province</SelectItem>
                  <SelectItem value="contactPostal">Contact Postal Code</SelectItem>
                  <SelectItem value="contactAddress1">Contact Address Line 1</SelectItem>
                  <SelectItem value="contactAddress2">Contact Address Line 2</SelectItem>
                  <SelectItem value="contactAddress3">Contact Address Line 3</SelectItem>
                  <SelectItem value="hqCountry">HQ Country</SelectItem>
                  <SelectItem value="hqCity">HQ City</SelectItem>
                  <SelectItem value="hqState">HQ State/Province</SelectItem>
                  <SelectItem value="hqPostal">HQ Postal Code</SelectItem>
                  <SelectItem value="hqAddress1">HQ Address Line 1</SelectItem>
                  <SelectItem value="hqAddress2">HQ Address Line 2</SelectItem>
                  <SelectItem value="hqAddress3">HQ Address Line 3</SelectItem>
                  <SelectItem value="title">Job Title</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="mobile">Mobile</SelectItem>
                  <SelectItem value="linkedinUrl">LinkedIn URL</SelectItem>
                  <SelectItem value="formerPosition">Former Position</SelectItem>
                  <SelectItem value="timeInCurrentPosition">Time in Current Position</SelectItem>
                  <SelectItem value="timeInCurrentCompany">Time in Current Company</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="field-value">New Value</Label>
              <Input
                id="field-value"
                placeholder="Enter new value..."
                value={bulkUpdateFieldValue}
                onChange={(e) => setBulkUpdateFieldValue(e.target.value)}
                data-testid="input-field-value"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This value will be applied to all selected contacts
              </p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-bulk-field-update">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmBulkFieldUpdate}
              disabled={bulkFieldUpdateMutation.isPending || !bulkUpdateFieldName || bulkUpdateFieldValue === ""}
              data-testid="button-confirm-bulk-field-update"
            >
              {bulkFieldUpdateMutation.isPending ? "Updating..." : `Update ${selectedContactIds.size} Contact(s)`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={enrichmentDialogOpen} onOpenChange={setEnrichmentDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start Enrichment Job</AlertDialogTitle>
            <AlertDialogDescription>
              Queue a background job to enrich all eligible contacts with company addresses and phone numbers.
              No contact limits - processes entire campaign automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-4 space-y-4">
            <div className="space-y-2">
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                <span>Automatic account-level deduplication (reuses data for contacts at same company)</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                <span>Global rate limiting (40 API calls/minute) prevents throttling</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                <span>Real-time progress tracking with detailed statistics</span>
              </div>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600" />
                <span>High-confidence results (≥70%) saved automatically, low-confidence (≥55%) flagged for review</span>
              </div>
            </div>
            
            <div className="space-y-3 pt-3 border-t">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="force-reenrich"
                  checked={forceReenrich}
                  onCheckedChange={(checked) => setForceReenrich(checked as boolean)}
                  data-testid="checkbox-force-reenrich"
                />
                <div className="flex-1 space-y-1">
                  <Label 
                    htmlFor="force-reenrich" 
                    className="text-sm font-medium cursor-pointer"
                  >
                    Force Re-enrichment
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Re-enrich accounts even if they already have enrichment data. 
                    Use this to refresh outdated information or when data quality is suspect.
                  </p>
                </div>
              </div>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-enrichment">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEnrichCompanyData}
              disabled={queueEnrichmentMutation.isPending}
              data-testid="button-confirm-enrichment"
            >
              {queueEnrichmentMutation.isPending ? "Queueing..." : "Start Enrichment Job"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Email Validation Dialog */}
      <Dialog open={emailValidationDialogOpen} onOpenChange={setEmailValidationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Start Email Validation</DialogTitle>
            <DialogDescription>
              Validate email addresses for eligible contacts. Already validated emails (from any campaign) will be skipped automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="validation-limit">Number of Contacts to Validate</Label>
              <Input
                id="validation-limit"
                type="number"
                min={100}
                max={10000}
                step={100}
                value={emailValidationLimit}
                onChange={(e) => setEmailValidationLimit(Math.min(10000, Math.max(100, parseInt(e.target.value) || 2500)))}
                data-testid="input-validation-limit"
              />
              <p className="text-xs text-muted-foreground">
                Validates up to this many eligible contacts with reserved slots. Processing speed: ~60 emails/minute.
              </p>
            </div>
            
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                <span>3-layer validation: syntax, DNS/MX check, and Kickbox deep verification</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                <span>Cross-campaign cache: emails validated in other campaigns are reused</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 mt-0.5 text-green-600" />
                <span>Only eligible contacts with reserved slots are processed</span>
              </div>
              <div className="flex items-start gap-2 text-sm">
                <AlertCircle className="h-4 w-4 mt-0.5 text-amber-600" />
                <span>Estimated time: ~{Math.ceil(emailValidationLimit / 60)} minutes for {emailValidationLimit} contacts</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEmailValidationDialogOpen(false)}
              data-testid="button-cancel-email-validation"
            >
              Cancel
            </Button>
            <Button
              onClick={() => startEmailValidationMutation.mutate(emailValidationLimit)}
              disabled={startEmailValidationMutation.isPending}
              data-testid="button-confirm-email-validation"
            >
              {startEmailValidationMutation.isPending ? "Starting..." : `Validate ${emailValidationLimit} Contacts`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Validation Results Upload Dialog */}
      <Dialog open={validationUploadOpen} onOpenChange={setValidationUploadOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Validation Results</DialogTitle>
            <DialogDescription>
              Upload CSV file with validated email results from external service (ZeroBounce, NeverBounce, etc.)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="validation-csv-file">CSV File</Label>
              <Input
                id="validation-csv-file"
                type="file"
                accept=".csv"
                onChange={(e) => setValidationUploadFile(e.target.files?.[0] || null)}
                data-testid="input-validation-csv-file"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Required columns: <strong>email</strong>, <strong>emailStatus</strong> (or "Email Status")
              </p>
              <p className="text-xs text-muted-foreground">
                Status values: valid, acceptable, invalid, unknown
              </p>
            </div>

            {validationUploadResults && (
              <div className="space-y-2 p-3 bg-muted/50 rounded-md border">
                <h4 className="font-medium text-sm">Upload Results:</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Total Rows: <strong>{validationUploadResults.total}</strong></div>
                  <div>Updated: <strong className="text-green-600">{validationUploadResults.updated}</strong></div>
                  <div>Not Found: <strong className="text-amber-600">{validationUploadResults.notFound}</strong></div>
                  <div>Errors: <strong className="text-red-600">{validationUploadResults.errors?.length || 0}</strong></div>
                </div>
                {validationUploadResults.errors && validationUploadResults.errors.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto">
                    <p className="text-xs font-medium mb-1">Errors:</p>
                    {validationUploadResults.errors.map((err: string, idx: number) => (
                      <p key={idx} className="text-xs text-red-600">{err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setValidationUploadOpen(false);
              setValidationUploadFile(null);
              setValidationUploadResults(null);
            }}>
              Close
            </Button>
            <Button
              onClick={async () => {
                if (!validationUploadFile) {
                  toast({ title: "Error", description: "Please select a file", variant: "destructive" });
                  return;
                }

                try {
                  const reader = new FileReader();
                  reader.onload = async (e) => {
                    const csvData = e.target?.result as string;
                    
                    const response = await fetch(`/api/verification-campaigns/${campaignId}/upload/validation-results`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${localStorage.getItem('authToken')}`,
                      },
                      credentials: "include",
                      body: JSON.stringify({ csvData }),
                    });

                    const result = await response.json();
                    setValidationUploadResults(result);
                    
                    toast({
                      title: "Upload Complete",
                      description: `Updated ${result.updated} contacts out of ${result.total} rows`,
                    });
                    
                    queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
                  };
                  reader.readAsText(validationUploadFile);
                } catch (error) {
                  toast({
                    title: "Error",
                    description: "Failed to upload validation results",
                    variant: "destructive",
                  });
                }
              }}
              disabled={!validationUploadFile}
              data-testid="button-confirm-validation-upload"
            >
              Upload & Process
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submission Records Upload Dialog */}
      <Dialog open={submissionUploadOpen} onOpenChange={setSubmissionUploadOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Submission Records</DialogTitle>
            <DialogDescription>
              Upload CSV file with contacts that have been delivered to client. These will be excluded from eligibility for 2 years.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="submission-csv-file">CSV File</Label>
              <Input
                id="submission-csv-file"
                type="file"
                accept=".csv"
                onChange={(e) => setSubmissionUploadFile(e.target.files?.[0] || null)}
                data-testid="input-submission-csv-file"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Required: <strong>email</strong> (or contact_id)
              </p>
              <p className="text-xs text-muted-foreground">
                Optional: <strong>submitted_at</strong> (date when delivered to client)
              </p>
            </div>

            {submissionUploadResults && (
              <div className="space-y-2 p-3 bg-muted/50 rounded-md border">
                <h4 className="font-medium text-sm">Upload Results:</h4>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>Total Rows: <strong>{submissionUploadResults.total}</strong></div>
                  <div>Created: <strong className="text-green-600">{submissionUploadResults.created}</strong></div>
                  <div>Already Submitted: <strong className="text-amber-600">{submissionUploadResults.alreadySubmitted}</strong></div>
                  <div>Not Found: <strong className="text-amber-600">{submissionUploadResults.notFound}</strong></div>
                  <div>Errors: <strong className="text-red-600">{submissionUploadResults.errors?.length || 0}</strong></div>
                </div>
                {submissionUploadResults.errors && submissionUploadResults.errors.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto">
                    <p className="text-xs font-medium mb-1">Errors:</p>
                    {submissionUploadResults.errors.map((err: string, idx: number) => (
                      <p key={idx} className="text-xs text-red-600">{err}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800">
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <strong>Note:</strong> Contacts marked as submitted will be excluded from future eligibility checks for 2 years to prevent duplicate submissions.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setSubmissionUploadOpen(false);
              setSubmissionUploadFile(null);
              setSubmissionUploadResults(null);
            }}>
              Close
            </Button>
            <Button
              onClick={async () => {
                if (!submissionUploadFile) {
                  toast({ title: "Error", description: "Please select a file", variant: "destructive" });
                  return;
                }

                try {
                  const reader = new FileReader();
                  reader.onload = async (e) => {
                    const csvData = e.target?.result as string;
                    
                    const response = await fetch(`/api/verification-campaigns/${campaignId}/upload/submissions`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${localStorage.getItem('authToken')}`,
                      },
                      credentials: "include",
                      body: JSON.stringify({ csvData }),
                    });

                    const result = await response.json();
                    setSubmissionUploadResults(result);
                    
                    toast({
                      title: "Upload Complete",
                      description: `Created ${result.created} submission records out of ${result.total} rows`,
                    });
                    
                    queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
                  };
                  reader.readAsText(submissionUploadFile);
                } catch (error) {
                  toast({
                    title: "Error",
                    description: "Failed to upload submission records",
                    variant: "destructive",
                  });
                }
              }}
              disabled={!submissionUploadFile}
              data-testid="button-confirm-submission-upload"
            >
              Upload & Process
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
