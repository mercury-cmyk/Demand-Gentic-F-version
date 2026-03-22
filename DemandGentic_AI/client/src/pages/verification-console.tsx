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
  const [currentContactId, setCurrentContactId] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [contactToDelete, setContactToDelete] = useState(null);
  const [selectedContactIds, setSelectedContactIds] = useState>(new Set());
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkDeleteReason, setBulkDeleteReason] = useState("");
  const [bulkFieldUpdateDialogOpen, setBulkFieldUpdateDialogOpen] = useState(false);
  const [bulkUpdateFieldName, setBulkUpdateFieldName] = useState("");
  const [bulkUpdateFieldValue, setBulkUpdateFieldValue] = useState("");
  const [enrichmentDialogOpen, setEnrichmentDialogOpen] = useState(false);
  const [activeEnrichmentJobId, setActiveEnrichmentJobId] = useState(null);
  const [forceReenrich, setForceReenrich] = useState(false);
  const [validationJobId, setValidationJobId] = useState(null);
  const [validationProgress, setValidationProgress] = useState(null);
  const [validationUploadOpen, setValidationUploadOpen] = useState(false);
  const [validationUploadFile, setValidationUploadFile] = useState(null);
  const [validationUploadResults, setValidationUploadResults] = useState(null);
  const [submissionUploadOpen, setSubmissionUploadOpen] = useState(false);
  const [submissionUploadFile, setSubmissionUploadFile] = useState(null);
  const [submissionUploadResults, setSubmissionUploadResults] = useState(null);
  const [emailValidationDialogOpen, setEmailValidationDialogOpen] = useState(false);
  const [emailValidationLimit, setEmailValidationLimit] = useState(2500);
  const [activeEmailValidationJobId, setActiveEmailValidationJobId] = useState(null);
  const [emailValidationJobProgress, setEmailValidationJobProgress] = useState(null);
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
    setSelectedContactIds(new Set());
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
  const { data: enrichmentJobsData, error: enrichmentJobsError } = useQuery({
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

  const { data: associatedContacts = [] } = useQuery({
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
      const allIds = new Set((queue as any).data.map((c: any) => c.id as string));
      setSelectedContactIds(allIds);
    } else {
      setSelectedContactIds(new Set());
    }
  };

  const handleSelectAllRecords = async () => {
    const result = await fetchAllIds();
    if (result.data?.ids) {
      setSelectedContactIds(new Set(result.data.ids));
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
    
      
        
           navigate("/verification/campaigns")}
            data-testid="button-back"
          >
            
            Back
          
          
            
              {(campaign as any)?.name || "Verification Console"}
            
            
              Data verification and enrichment workstation
            
          
        
         setEnrichmentDialogOpen(true)}
          disabled={queueEnrichmentMutation.isPending || !!activeEnrichmentJobId}
          data-testid="button-enrich"
        >
          
          {queueEnrichmentMutation.isPending ? "Queueing..." : activeEnrichmentJobId ? "Enrichment Running" : "Enrich Company Data"}
        
      

      
        
          
            Eligible (Total)
          
          
            
              {(stats as any)?.eligible_count || 0}
            
            
              ✓ {(stats as any)?.eligible_unsuppressed_count || 0} Active
              {" • "}
              ✗ {(stats as any)?.eligible_suppressed_count || 0} Suppressed
            
          
        
        
          
            Validated
          
          
            
              
                {(stats as any)?.validated_count || 0}
              
              {(stats as any)?.validated_count > 0 && (stats as any)?.ok_email_count === 0 && (
                 {
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
                  
                  Validate Emails
                
              )}
            
          
        
        
          
            OK Email Rate
          
          
            
              
                {(okRate * 100).toFixed(1)}%
              
              
              
                Target: {Number((campaign as any)?.okRateTarget || 0.95) * 100}%
              
            
          
        
        
          
            Deliverability
          
          
            
              
                {(deliverability * 100).toFixed(1)}%
              
              
              
                Target: {Number((campaign as any)?.deliverabilityTarget || 0.97) * 100}%
              
            
          
        
        
          
            Submissions
          
          
            
              
                {(stats as any)?.submission_count || 0}
              
              
              
                of {(campaign as any)?.monthlyTarget || 0} target
              
            
          
        
      

      {/* Show enrichment progress when job is active */}
      {activeEnrichmentJobId && (
         {
            setActiveEnrichmentJobId(null);
            queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'enrichment-jobs'] });
            queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
            queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "queue"] });
          }}
        />
      )}

      {/* Email Validation Progress */}
      {activeEmailValidationJobId && emailValidationJobProgress && (
        
          
            
              
              Email Validation in Progress
            
          
          
            
              
              
                
                  {emailValidationJobProgress.processedContacts || 0} / {emailValidationJobProgress.totalContacts || 0} contacts
                
                {emailValidationJobProgress.progressPercent || 0}%
              
              {emailValidationJobProgress.validCount !== undefined && (
                
                  Valid: {emailValidationJobProgress.validCount}
                  Invalid: {emailValidationJobProgress.invalidCount || 0}
                  Risky: {emailValidationJobProgress.riskyCount || 0}
                
              )}
            
          
        
      )}

      {/* Submission Manager - Built-in Validation Workflow */}
      
        
          
            
              Submission Manager
              
                Built-in email validation and client delivery workflow
              
            
             setEmailValidationDialogOpen(true)}
              disabled={startEmailValidationMutation.isPending || !!activeEmailValidationJobId}
              data-testid="button-start-email-validation"
            >
              
              {activeEmailValidationJobId ? "Validation Running..." : "Start Email Validation"}
            
          
        
        
          
            
              Step 1: Review Eligible
              {canExportData && (
                 {
                    window.location.href = `/api/verification-campaigns/${campaignId}/contacts/export/validated-verified`;
                  }}
                  data-testid="button-export-for-validation"
                  className="w-full justify-start"
                >
                  
                  Export Eligible Contacts
                
              )}
              
                Download contacts with validated emails (auto-validated)
              
            

            
              Step 2: Lock for Delivery
               {
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
                
                Lock Validated Contacts
              
              
                Lock contacts with validated emails for delivery
              
            

            
              Step 3: Export for Client
              {canExportData && (
                 {
                    window.location.href = `/api/verification-campaigns/${campaignId}/submission/export?template=enriched`;
                  }}
                  data-testid="button-export-for-client"
                  className="w-full justify-start"
                >
                  
                  Export Buffered Leads
                
              )}
              
                Download final leads for client delivery
              
            

            
              Step 4: Clear Buffer
               {
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
                
                Clear Buffer
              
              
                Reset buffer after client delivery
              
            
          

          
            
              
                Built-in Email Validation
                
                  Automatic Workflow: Contacts are validated in the background using built-in DNS/MX verification → 
                  Export eligible contacts → Lock for delivery → Export for client → Clear buffer
                
              
              
                 {
                    setValidationUploadOpen(true);
                    setValidationUploadResults(null);
                  }}
                  data-testid="button-upload-validation-results"
                >
                  
                  Upload External Validation (Optional)
                
                 {
                    setSubmissionUploadOpen(true);
                    setSubmissionUploadResults(null);
                  }}
                  data-testid="button-upload-submission-records"
                >
                  
                  Upload Submission Records
                
              
              
                💡 Tip: Email validation now runs automatically in the background. You can still upload external validation results if needed.
              
            
          
        
      

      {!currentContactId ? (
        
          
            
              
                Verification Queue
                
                  {queueLoading ? "Loading..." : `${(queue as any)?.total || 0} contacts ready for verification`}
                
              
              
                {canExportData && (
                   {
                      window.location.href = `/api/verification-campaigns/${campaignId}/contacts/export/validated-verified`;
                    }}
                    data-testid="button-export-validated-verified"
                  >
                    
                    Export Validated+Verified
                  
                )}
                 setShowFilters(!showFilters)}
                  data-testid="button-toggle-filters"
                >
                  
                  {showFilters ? "Hide" : "Show"} Filters
                
              
            
          
          
            {showFilters && (
              
                
                  
                    Contact Search
                     updateFilters({ ...filters, contactSearch: e.target.value })}
                      data-testid="input-contact-search"
                    />
                  
                  
                    Phone Search
                     updateFilters({ ...filters, phoneSearch: e.target.value })}
                      data-testid="input-phone-search"
                    />
                  
                  
                    Company Search
                     updateFilters({ ...filters, companySearch: e.target.value })}
                      data-testid="input-company-search"
                    />
                  
                  
                    Country
                     updateFilters({ ...filters, country: e.target.value })}
                      data-testid="input-country"
                    />
                  
                  
                    Source Type
                     updateFilters({ ...filters, sourceType: value === "all" ? "" : value })}
                    >
                      
                        
                      
                      
                        All sources
                        Client Provided
                        New Sourced
                      
                    
                  
                  
                    Eligibility Status
                     updateFilters({ ...filters, eligibilityStatus: value === "all" ? "" : value })}
                    >
                      
                        
                      
                      
                        All statuses
                        Eligible
                        Not Eligible
                      
                    
                  
                  
                    Email Status
                     updateFilters({ ...filters, emailStatus: value === "all" ? "" : value })}
                    >
                      
                        
                      
                      
                        All statuses
                        Valid
                        Acceptable
                        Unknown
                        Invalid
                      
                    
                  
                  
                    Verification Status
                     updateFilters({ ...filters, verificationStatus: value === "all" ? "" : value })}
                    >
                      
                        
                      
                      
                        All statuses
                        Pending
                        Validated
                        Rejected
                      
                    
                  
                  
                    Has Phone
                     updateFilters({ ...filters, hasPhone: value === "all" ? "" : value })}
                    >
                      
                        
                      
                      
                        All
                        Yes
                        No
                      
                    
                  
                  
                    Has Address
                     updateFilters({ ...filters, hasAddress: value === "all" ? "" : value })}
                    >
                      
                        
                      
                      
                        All
                        Yes
                        No
                      
                    
                  
                  
                    CAV Status
                     updateFilters({ ...filters, hasCav: value === "all" ? "" : value })}
                    >
                      
                        
                      
                      
                        All
                        Has CAV
                        No CAV
                      
                    
                  
                
                
                  
                    {(filters.contactSearch || filters.phoneSearch || filters.companySearch || filters.sourceType || filters.country || filters.eligibilityStatus || filters.emailStatus || filters.verificationStatus || filters.hasPhone || filters.hasAddress || filters.hasCav)
                      ? "Filters active"
                      : "No filters applied"}
                  
                   {
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
                    
                    Clear All
                  
                
              
            )}
            {validationProgress && validationProgress.status === 'processing' && (
              
                Email Validation in Progress
                
                  Batch {validationProgress.currentBatch}/{validationProgress.totalBatches} 
                  {" | "}
                  {validationProgress.processedContacts}/{validationProgress.totalContacts} contacts
                  {" | "}
                  {Math.round((validationProgress.processedContacts / validationProgress.totalContacts) * 100)}% complete
                
                
              
            )}
            
              {(queue as any)?.data?.length === 50 && (
                
                  
                  Select All Records{allIds?.total ? ` (${allIds.total})` : ''}
                
              )}
              {selectedContactIds.size > 0 && (
                
                  
                    
                      
                        {selectedContactIds.size} selected
                      
                       setSelectedContactIds(new Set())}
                        disabled={bulkDeleteMutation.isPending || bulkEmailValidationMutation.isPending || bulkEnrichmentMutation.isPending || bulkMarkValidatedMutation.isPending}
                        data-testid="button-clear-selection"
                      >
                        Clear Selection
                      
                    
                    
                      
                        
                        {bulkEmailValidationMutation.isPending ? "Validating..." : "Validate Emails"}
                      
                      
                        
                        {bulkEnrichmentMutation.isPending ? "Enriching..." : "Enrich Data"}
                      
                      
                        
                        {bulkMarkValidatedMutation.isPending ? "Marking..." : "Mark Validated"}
                      
                      
                        
                        {bulkFieldUpdateMutation.isPending ? "Updating..." : "Update Field"}
                      
                      
                        
                        {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
                      
                    
                  
                
              )}
            
            {queueLoading ? (
              Loading queue...
            ) : (queue as any)?.data && (queue as any).data.length > 0 ? (
              
                
                  
                    
                      
                         0}
                          onCheckedChange={handleSelectAll}
                          data-testid="checkbox-select-all"
                        />
                      
                      Name
                      Title
                      Company
                      Email
                      Email Status
                      Phone
                      City
                      Country
                      Source
                      Actions
                    
                  
                  
                    {(queue as any).data.map((contact: any, index: number) => (
                       setCurrentContactId(contact.id)}
                        data-testid={`row-contact-${index}`}
                      >
                         e.stopPropagation()}>
                           handleSelectContact(contact.id, !!checked)}
                            data-testid={`checkbox-select-${index}`}
                          />
                        
                        
                          {contact.full_name || contact.fullName}
                        
                        
                          {contact.title || "-"}
                        
                        
                          {contact.account_name || "-"}
                        
                        
                          {contact.email || "-"}
                        
                        
                          {renderEmailStatusBadge(contact.email_status || contact.emailStatus, 'sm')}
                        
                        
                          {contact.phone || "-"}
                        
                        
                          {contact.contact_city || contact.contactCity || "-"}
                        
                        
                          {contact.contact_country || contact.contactCountry || "-"}
                        
                        
                          
                            {contact.source_type || contact.sourceType}
                          
                        
                        
                          
                             {
                                e.stopPropagation();
                                setCurrentContactId(contact.id);
                              }}
                              data-testid={`button-view-${index}`}
                            >
                              View Details
                            
                             {
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
                              
                            
                          
                        
                      
                    ))}
                  
                
              
            ) : (
              
                Queue is empty
                No contacts available for verification.
              
            )}
          
        
      ) : (
        
            {(contact as any)?.account_name && (
              
                
                  Account Lead Cap
                
                
                  
                    
                      
                        {(contact as any)?.account_name}
                      
                      
                        {(accountCap as any)?.submitted || 0} / {(campaign as any)?.leadCapPerAccount || 10}
                      
                    
                    
                    {((accountCap as any)?.submitted || 0) >= ((campaign as any)?.leadCapPerAccount || 10) && (
                      
                        Cap reached - cannot submit more leads for this account
                      
                    )}
                  
                
              
            )}
          
            
              Contact & Company Information
              
                
                  {(contact as any)?.eligibility_status || (contact as any)?.eligibilityStatus}
                
                {(contact as any)?.suppressed && Suppressed}
              
            
            
              
                Contact Details
                
                  
                    Full Name
                    
                  
                  
                    First Name
                    
                  
                  
                    Last Name
                    
                  
                  
                    Title
                    
                  
                  
                    Email
                    
                      
                      {renderEmailStatusBadge((contact as any)?.email_status || (contact as any)?.emailStatus, 'md')}
                    
                  
                  
                    Phone
                    
                  
                  
                    Mobile
                    
                  
                  
                    LinkedIn URL
                    
                  
                  
                    Contact Address 1
                    
                  
                  
                    Contact Address 2
                    
                  
                  
                    Contact Address 3
                    
                  
                  
                    City
                    
                  
                  
                    State
                    
                  
                  
                    Country
                    
                  
                  
                    Postal Code
                    
                  
                  
                    CAV ID
                    
                  
                  
                    CAV User ID
                    
                  
                
              

              
                Company Information
                
                  
                    Company Name
                    
                  
                  
                    Domain
                    
                  
                  
                    HQ Phone (Enriched)
                    
                  
                
              

              {(contact as any)?.account_custom_fields && Object.keys((contact as any).account_custom_fields).length > 0 && (
                
                  Account Custom Fields
                  
                    {Object.entries((contact as any).account_custom_fields).map(([key, value]) => (
                      
                        
                          {key.replace(/_/g, ' ')}
                        
                        
                      
                    ))}
                  
                
              )}

              
                Contact Address & Phone (Enriched)
                
                  
                    Phone
                    
                  
                  
                    Address 1
                    
                  
                  
                    Address 2
                    
                  
                  
                    Address 3
                    
                  
                  
                    City
                    
                  
                  
                    State
                    
                  
                  
                    Postal Code
                    
                  
                  
                    Country
                    
                  
                
              

              
                Status & Metadata
                
                  
                    Source Type
                    
                  
                  
                    Verification Status
                    
                  
                  
                    QA Status
                    
                  
                
              

              {((contact as any)?.custom_fields || (contact as any)?.customFields) && Object.keys((contact as any)?.custom_fields || (contact as any)?.customFields || {}).length > 0 && (
                
                  Custom Fields
                  
                    {Object.entries((contact as any)?.custom_fields || (contact as any)?.customFields || {}).map(([key, value]) => (
                      
                        
                          {key.replace(/_/g, ' ')}
                        
                        
                      
                    ))}
                  
                
              )}

              {(contact as any)?.suppressed && (
                
                  
                    ⚠️ This contact is suppressed and cannot be processed
                  
                
              )}

              {(contact as any)?.eligibility_status !== 'Eligible' && !(contact as any)?.suppressed && (
                
                  
                    ℹ️ Not eligible: {(contact as any)?.eligibility_reason || 'Out of scope'}
                  
                
              )}

              
                 elvMutation.mutate()}
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
                  
                  {elvMutation.isPending ? "Validating..." : "Validate Email"}
                
                 singleContactEnrichmentMutation.mutate()}
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
                  
                  {singleContactEnrichmentMutation.isPending ? "Enriching..." : "Enrich Company"}
                
                 {
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
                  
                  Delete
                
                
                 setCurrentContactId(null)}
                  data-testid="button-skip"
                  disabled={(contact as any)?.suppressed}
                >
                  Skip
                
                
                  Save & Next
                
              
            
          

          {(contact as any)?.account_id && (
            
              
                Associated Contacts from {(contact as any)?.account_name}
              
              
                {associatedContacts.length > 0 ? (
                  
                    {associatedContacts.map((assocContact: any, index: number) => (
                      
                        
                          
                            {assocContact.full_name || assocContact.fullName}
                            {assocContact.title || "-"}
                          
                          
                            Email
                            {assocContact.email || "-"}
                          
                          
                            Phone
                            {assocContact.phone || assocContact.mobile || "-"}
                          
                          
                            
                              {assocContact.verification_status || assocContact.verificationStatus}
                            
                            {(assocContact.deleted || assocContact.suppressed) && (
                              
                                {assocContact.deleted ? 'Deleted' : 'Suppressed'}
                              
                            )}
                          
                        
                        {assocContact.id !== currentContactId && (
                           setCurrentContactId(assocContact.id)}
                            data-testid={`button-view-contact-${index}`}
                          >
                            View
                          
                        )}
                      
                    ))}
                  
                ) : (
                  No other contacts found for this company.
                )}
              
            
          )}
        
      )}

      
        
          
            Delete Contact
            
              Are you sure you want to delete {contactToDelete?.name}? This action cannot be undone.
            
          
          
            Cancel
             {
                if (contactToDelete) {
                  deleteMutation.mutate(contactToDelete.id);
                }
              }}
              disabled={deleteMutation.isPending}
              className="bg-destructive hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            
          
        
      

      
        
          
            Bulk Delete Contacts
            
              You are about to delete {selectedContactIds.size} contact(s). This action cannot be undone.
            
          
          
            Reason (optional)
             setBulkDeleteReason(e.target.value)}
              data-testid="input-bulk-delete-reason"
              className="mt-2"
            />
          
          
            Cancel
            
              {bulkDeleteMutation.isPending ? "Deleting..." : `Delete ${selectedContactIds.size} Contact(s)`}
            
          
        
      

      
        
          
            Bulk Update Field
            
              Update a field value for {selectedContactIds.size} selected contact(s).
            
          
          
            
              Field to Update
              
                
                  
                
                
                  Contact Country
                  Contact City
                  Contact State/Province
                  Contact Postal Code
                  Contact Address Line 1
                  Contact Address Line 2
                  Contact Address Line 3
                  HQ Country
                  HQ City
                  HQ State/Province
                  HQ Postal Code
                  HQ Address Line 1
                  HQ Address Line 2
                  HQ Address Line 3
                  Job Title
                  Phone
                  Mobile
                  LinkedIn URL
                  Former Position
                  Time in Current Position
                  Time in Current Company
                
              
            
            
              New Value
               setBulkUpdateFieldValue(e.target.value)}
                data-testid="input-field-value"
                className="mt-2"
              />
              
                This value will be applied to all selected contacts
              
            
          
          
            Cancel
            
              {bulkFieldUpdateMutation.isPending ? "Updating..." : `Update ${selectedContactIds.size} Contact(s)`}
            
          
        
      

      
        
          
            Start Enrichment Job
            
              Queue a background job to enrich all eligible contacts with company addresses and phone numbers.
              No contact limits - processes entire campaign automatically.
            
          
          
            
              
                
                Automatic account-level deduplication (reuses data for contacts at same company)
              
              
                
                Global rate limiting (40 API calls/minute) prevents throttling
              
              
                
                Real-time progress tracking with detailed statistics
              
              
                
                High-confidence results (≥70%) saved automatically, low-confidence (≥55%) flagged for review
              
            
            
            
              
                 setForceReenrich(checked as boolean)}
                  data-testid="checkbox-force-reenrich"
                />
                
                  
                    Force Re-enrichment
                  
                  
                    Re-enrich accounts even if they already have enrichment data. 
                    Use this to refresh outdated information or when data quality is suspect.
                  
                
              
            
          
          
            Cancel
            
              {queueEnrichmentMutation.isPending ? "Queueing..." : "Start Enrichment Job"}
            
          
        
      

      {/* Email Validation Dialog */}
      
        
          
            Start Email Validation
            
              Validate email addresses for eligible contacts. Already validated emails (from any campaign) will be skipped automatically.
            
          
          
            
              Number of Contacts to Validate
               setEmailValidationLimit(Math.min(10000, Math.max(100, parseInt(e.target.value) || 2500)))}
                data-testid="input-validation-limit"
              />
              
                Validates up to this many eligible contacts with reserved slots. Processing speed: ~60 emails/minute.
              
            
            
            
              
                
                3-layer validation: syntax, DNS/MX check, and Kickbox deep verification
              
              
                
                Cross-campaign cache: emails validated in other campaigns are reused
              
              
                
                Only eligible contacts with reserved slots are processed
              
              
                
                Estimated time: ~{Math.ceil(emailValidationLimit / 60)} minutes for {emailValidationLimit} contacts
              
            
          
          
             setEmailValidationDialogOpen(false)}
              data-testid="button-cancel-email-validation"
            >
              Cancel
            
             startEmailValidationMutation.mutate(emailValidationLimit)}
              disabled={startEmailValidationMutation.isPending}
              data-testid="button-confirm-email-validation"
            >
              {startEmailValidationMutation.isPending ? "Starting..." : `Validate ${emailValidationLimit} Contacts`}
            
          
        
      

      {/* Validation Results Upload Dialog */}
      
        
          
            Upload Validation Results
            
              Upload CSV file with validated email results from external service (ZeroBounce, NeverBounce, etc.)
            
          
          
            
              CSV File
               setValidationUploadFile(e.target.files?.[0] || null)}
                data-testid="input-validation-csv-file"
              />
              
                Required columns: email, emailStatus (or "Email Status")
              
              
                Status values: valid, acceptable, invalid, unknown
              
            

            {validationUploadResults && (
              
                Upload Results:
                
                  Total Rows: {validationUploadResults.total}
                  Updated: {validationUploadResults.updated}
                  Not Found: {validationUploadResults.notFound}
                  Errors: {validationUploadResults.errors?.length || 0}
                
                {validationUploadResults.errors && validationUploadResults.errors.length > 0 && (
                  
                    Errors:
                    {validationUploadResults.errors.map((err: string, idx: number) => (
                      {err}
                    ))}
                  
                )}
              
            )}
          
          
             {
              setValidationUploadOpen(false);
              setValidationUploadFile(null);
              setValidationUploadResults(null);
            }}>
              Close
            
             {
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
            
          
        
      

      {/* Submission Records Upload Dialog */}
      
        
          
            Upload Submission Records
            
              Upload CSV file with contacts that have been delivered to client. These will be excluded from eligibility for 2 years.
            
          
          
            
              CSV File
               setSubmissionUploadFile(e.target.files?.[0] || null)}
                data-testid="input-submission-csv-file"
              />
              
                Required: email (or contact_id)
              
              
                Optional: submitted_at (date when delivered to client)
              
            

            {submissionUploadResults && (
              
                Upload Results:
                
                  Total Rows: {submissionUploadResults.total}
                  Created: {submissionUploadResults.created}
                  Already Submitted: {submissionUploadResults.alreadySubmitted}
                  Not Found: {submissionUploadResults.notFound}
                  Errors: {submissionUploadResults.errors?.length || 0}
                
                {submissionUploadResults.errors && submissionUploadResults.errors.length > 0 && (
                  
                    Errors:
                    {submissionUploadResults.errors.map((err: string, idx: number) => (
                      {err}
                    ))}
                  
                )}
              
            )}
            
            
              
                Note: Contacts marked as submitted will be excluded from future eligibility checks for 2 years to prevent duplicate submissions.
              
            
          
          
             {
              setSubmissionUploadOpen(false);
              setSubmissionUploadFile(null);
              setSubmissionUploadResults(null);
            }}>
              Close
            
             {
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
            
          
        
      
    
  );
}