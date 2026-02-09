import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, CheckCircle, XCircle, Clock, Download, Loader2, Phone, Play, Pause, Eye, User, RefreshCw, Sparkles, Building2, Package, Send, X, Trash2, Tag, Plus, RotateCcw, Target, ChevronDown, ChevronUp, Globe, Briefcase } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FilterBuilder } from "@/components/filter-builder";
import type { FilterGroup } from "@shared/filter-types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import type { LeadWithAccount, LeadTag } from "@shared/schema";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export default function LeadsPage() {
  const [, navigate] = useLocation();
  const searchString = useSearch();
  const urlParams = useMemo(() => new URLSearchParams(searchString), [searchString]);
  const tabFromUrl = urlParams.get('tab');
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingLeadId, setRejectingLeadId] = useState<string | null>(null);
  const [pmRejectDialogOpen, setPmRejectDialogOpen] = useState(false);
  const [pmRejectReason, setPmRejectReason] = useState("");
  const [pmRejectingLeadId, setPmRejectingLeadId] = useState<string | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState<LeadWithAccount | null>(null);
  const [filterGroup, setFilterGroup] = useState<FilterGroup | undefined>(undefined);
  const [playingLeadId, setPlayingLeadId] = useState<string | null>(null);
  const [audioRef, setAudioRef] = useState<HTMLAudioElement | null>(null);
  const [loadingRecordingId, setLoadingRecordingId] = useState<string | null>(null);
  const [selectedCampaignForReeval, setSelectedCampaignForReeval] = useState<string>("");
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [deliveringLeadId, setDeliveringLeadId] = useState<string | null>(null);
  const [submissionDialogOpen, setSubmissionDialogOpen] = useState(false);
  const [submittingLeadId, setSubmittingLeadId] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState<string>("");
  const [filterCampaign, setFilterCampaign] = useState<string>("");
  const [filterQAStatus, setFilterQAStatus] = useState<string>("");
  const [filterDeliveryStatus, setFilterDeliveryStatus] = useState<string>("");
  const [filterIndustry, setFilterIndustry] = useState<string>("");
  const [filterCompany, setFilterCompany] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>("");
  const [filterDateTo, setFilterDateTo] = useState<string>("");
  const [filterMinScore, setFilterMinScore] = useState<string>("");
  const [exportLoading, setExportLoading] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkUpdateDialogOpen, setBulkUpdateDialogOpen] = useState(false);
  const [bulkUpdateStatus, setBulkUpdateStatus] = useState<string>("");
  const [bulkUpdateAgent, setBulkUpdateAgent] = useState<string>("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingLeadId, setDeletingLeadId] = useState<string | null>(null);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");
  const [showQAParameters, setShowQAParameters] = useState(false);
  const { toast} = useToast();
  const { user } = useAuth();

  // Get user roles (support both legacy single role and new multi-role system)
  const userRoles = (user as any)?.roles || [user?.role || ''];
  
  // Check if user is agent-only (has agent role but no elevated roles)
  const isAgentOnly = userRoles.includes('agent') && 
                      !userRoles.includes('admin') && 
                      !userRoles.includes('campaign_manager') && 
                      !userRoles.includes('quality_analyst');

  const { data: leads = [], isLoading } = useQuery<LeadWithAccount[]>({
    queryKey: ['/api/leads', filterAgent, filterCampaign, filterQAStatus, filterDeliveryStatus, filterIndustry, filterCompany, filterDateFrom, filterDateTo, filterMinScore, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      // IMPORTANT: Don't send agentId filter for agent-only users (backend handles it)
      if (!isAgentOnly && filterAgent) params.append('agentId', filterAgent);
      if (filterCampaign) params.append('campaignId', filterCampaign);
      if (filterQAStatus) params.append('qaStatus', filterQAStatus);
      if (filterDeliveryStatus) params.append('deliveryStatus', filterDeliveryStatus);
      if (filterIndustry) params.append('industry', filterIndustry);
      if (filterCompany) params.append('company', filterCompany);
      if (filterDateFrom) params.append('dateFrom', filterDateFrom);
      if (filterDateTo) params.append('dateTo', filterDateTo);
      if (searchQuery) params.append('search', searchQuery);
      
      const url = `/api/leads${params.toString() ? '?' + params.toString() : ''}`;
      const response = await apiRequest('GET', url);
      const result = await response.json();
      return Array.isArray(result) ? result : [];
    },
    staleTime: 0,  // Always refetch to avoid caching issues
    refetchOnMount: true,  // Force refetch when component mounts
  });

  // Fetch all campaigns for reevaluation dropdown
  const { data: campaigns = [] } = useQuery<Array<{ id: string; name: string; type: string }>>({
    queryKey: ['/api/campaigns'],
  });

  const getAgentDisplayName = (lead: LeadWithAccount) => {
    const humanName = `${lead.agentFirstName || ''} ${lead.agentLastName || ''}`.trim();
    return (lead.agentDisplayName || humanName || lead.aiAgentName || (lead as any).customFields?.aiAgentName || '').trim();
  };

  const getAgentInitials = (lead: LeadWithAccount) => {
    const name = getAgentDisplayName(lead);
    if (!name) return '?';
    const parts = name.split(' ').filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  };

  // Fetch selected campaign details to show QA parameters
  const { data: selectedCampaignDetails } = useQuery<{
    id: string;
    name: string;
    qaParameters?: {
      min_score?: number;
      scoring_weights?: Record<string, number>;
      client_criteria?: {
        job_titles?: string[];
        seniority_levels?: string[];
        industries?: string[];
      };
      qualification_questions?: Array<{
        question: string;
        required: boolean;
        acceptable_responses: string[];
      }>;
    };
    customQaRules?: string;
    customQaFields?: Array<{
      name: string;
      label: string;
      type: string;
      required: boolean;
      options?: string[];
    }>;
  }>({
    queryKey: filterCampaign ? [`/api/campaigns/${filterCampaign}`] : [],
    enabled: !!filterCampaign,
  });

  // Fetch agents for filter dropdown
  const { data: agents = [] } = useQuery<Array<{ id: string; firstName: string; lastName: string; email: string }>>({
    queryKey: ['/api/users/agents'],
  });

  // Fetch industries for filter dropdown
  const { data: industries = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['/api/industries'],
  });

  // Fetch available tags
  const { data: availableTags = [] } = useQuery<LeadTag[]>({
    queryKey: ['/api/lead-tags'],
  });

  // Fetch deleted leads (admin only)
  const { data: deletedLeads = [], isLoading: deletedLoading } = useQuery<LeadWithAccount[]>({
    queryKey: ['/api/leads/deleted'],
    enabled: userRoles.includes('admin'),
  });

  // Restore single lead mutation
  const restoreLeadMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const res = await apiRequest('POST', `/api/leads/${leadId}/restore`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leads/deleted'] });
      toast({
        title: "Lead Restored",
        description: "The lead has been restored successfully.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to restore the lead.",
        variant: "destructive",
      });
    },
  });

  // Bulk restore leads mutation
  const bulkRestoreMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      const res = await apiRequest('POST', '/api/leads/bulk-restore', { leadIds });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leads/deleted'] });
      setSelectedLeads([]);
      toast({
        title: "Leads Restored",
        description: `${data.restoredCount} leads have been restored successfully.`,
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to restore leads.",
        variant: "destructive",
      });
    },
  });

  // Create new tag mutation
  const createTagMutation = useMutation({
    mutationFn: async ({ name, color }: { name: string; color: string }) => {
      return await apiRequest('POST', '/api/lead-tags', { name, color });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lead-tags'] });
      setTagDialogOpen(false);
      setNewTagName("");
      setNewTagColor("#6366f1");
      toast({
        title: "Success",
        description: "Tag created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create tag",
        variant: "destructive",
      });
    },
  });

  // Bulk tag mutation
  const bulkTagMutation = useMutation({
    mutationFn: async ({ leadIds, tagId }: { leadIds: string[]; tagId: string }) => {
      return await apiRequest('POST', '/api/leads/bulk-tag', { leadIds, tagId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      setSelectedLeads([]);
      toast({
        title: "Success",
        description: "Tags applied successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to apply tags",
        variant: "destructive",
      });
    },
  });

  // Add tag to single lead mutation
  const addTagMutation = useMutation({
    mutationFn: async ({ leadId, tagId }: { leadId: string; tagId: string }) => {
      return await apiRequest('POST', `/api/leads/${leadId}/tags/${tagId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      toast({
        title: "Success",
        description: "Tag added",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add tag",
        variant: "destructive",
      });
    },
  });

  // Remove tag from single lead mutation
  const removeTagMutation = useMutation({
    mutationFn: async ({ leadId, tagId }: { leadId: string; tagId: string }) => {
      return await apiRequest('DELETE', `/api/leads/${leadId}/tags/${tagId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      toast({
        title: "Success",
        description: "Tag removed",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove tag",
        variant: "destructive",
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }
      return await apiRequest('POST', `/api/leads/${id}/approve`, { approvedById: user.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      toast({
        title: "Success",
        description: "Lead approved successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve lead",
        variant: "destructive",
      });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      return await apiRequest('POST', `/api/leads/${id}/reject`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      setRejectDialogOpen(false);
      setRejectReason("");
      setRejectingLeadId(null);
      toast({
        title: "Success",
        description: "Lead rejected",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to reject lead",
        variant: "destructive",
      });
    },
  });

  // PM Approval mutation - for Project Management final approval
  const pmApproveMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }
      return await apiRequest('POST', `/api/leads/${id}/pm-approve`, { pmApprovedById: user.id });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      toast({
        title: "Success",
        description: "Lead approved by PM and submitted to client portal",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve lead",
        variant: "destructive",
      });
    },
  });

  // PM Rejection mutation - returns lead to QA for more work
  const pmRejectMutation = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }
      return await apiRequest('POST', `/api/leads/${id}/pm-reject`, { 
        pmRejectedById: user.id, 
        reason 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      setPmRejectDialogOpen(false);
      setPmRejectReason("");
      setPmRejectingLeadId(null);
      toast({
        title: "Returned to QA",
        description: "Lead returned to QA team for review",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to return lead to QA",
        variant: "destructive",
      });
    },
  });

  // Bulk PM Approval mutation
  const bulkPmApproveMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }
      return await apiRequest('POST', '/api/leads/pm-approve-bulk', { leadIds, pmApprovedById: user.id });
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      setSelectedLeads([]);
      toast({
        title: "Success",
        description: data.message || "Leads approved by PM and submitted to client portal",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve leads",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('DELETE', `/api/leads/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      setDeleteDialogOpen(false);
      setDeletingLeadId(null);
      toast({
        title: "Success",
        description: "Lead deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete lead",
        variant: "destructive",
      });
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      return await apiRequest('POST', '/api/leads/bulk-delete', { leadIds });
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      setBulkDeleteDialogOpen(false);
      setSelectedLeads([]);
      toast({
        title: "Success",
        description: data.message || "Leads deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete leads",
        variant: "destructive",
      });
    },
  });

  // Bulk update mutation
  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ leadIds, updates }: { leadIds: string[]; updates: { qaStatus?: string; agentId?: string } }) => {
      return await apiRequest('POST', '/api/leads/bulk-update', { leadIds, updates });
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      setBulkUpdateDialogOpen(false);
      setBulkUpdateStatus("");
      setBulkUpdateAgent("");
      setSelectedLeads([]);
      toast({
        title: "Success",
        description: data.message || "Leads updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update leads",
        variant: "destructive",
      });
    },
  });

  // Bulk export mutation
  const bulkExportMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      const response = await apiRequest('POST', '/api/leads/bulk-export', { leadIds });
      const data = await response.json() as { success: boolean; csv: string; filename: string; count: number };
      // Create and download the CSV file
      const blob = new Blob([data.csv], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', data.filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      return data;
    },
    onSuccess: (data) => {
      setSelectedLeads([]);
      toast({
        title: "Success",
        description: `Exported ${data.count} leads to ${data.filename}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to export leads",
        variant: "destructive",
      });
    },
  });

  const markDeliveredMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes?: string }) => {
      return await apiRequest('POST', `/api/leads/${id}/mark-delivered`, { notes });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      setDeliveryDialogOpen(false);
      setDeliveryNotes("");
      setDeliveringLeadId(null);
      toast({
        title: "Success",
        description: "Lead marked as delivered to client",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark lead as delivered",
        variant: "destructive",
      });
    },
  });

  const markDeliveredBulkMutation = useMutation({
    mutationFn: async ({ leadIds, notes }: { leadIds: string[]; notes?: string }) => {
      return await apiRequest('POST', '/api/leads/mark-delivered-bulk', { leadIds, notes });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      setDeliveryDialogOpen(false);
      setDeliveryNotes("");
      setSelectedLeads([]);
      toast({
        title: "Success",
        description: `${data.count} lead(s) marked as delivered to client`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark leads as delivered",
        variant: "destructive",
      });
    },
  });

  const submitToClientMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('POST', `/api/leads/${id}/submit-to-client`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      setSubmissionDialogOpen(false);
      setSubmittingLeadId(null);
      toast({
        title: "Success",
        description: "Lead submitted to client landing page",
      });
    },
    onError: (error: any) => {
      const errorMessage = error.errors ? error.errors.join(', ') : error.message || "Failed to submit lead";
      toast({
        variant: "destructive",
        title: "Submission Failed",
        description: errorMessage,
      });
    },
  });

  const submitToClientBulkMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      return await apiRequest('POST', '/api/leads/submit-to-client-bulk', { leadIds });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      setSubmissionDialogOpen(false);
      setSelectedLeads([]);
      toast({
        title: "Submission Complete",
        description: `${data.successCount} lead(s) submitted successfully. ${data.failureCount} failed.`,
        variant: data.failureCount > 0 ? "destructive" : "default",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to bulk submit leads",
      });
    },
  });

  // Publish lead mutation - moves from approved to published (available in project management)
  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('POST', `/api/leads/${id}/publish`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      toast({
        title: "Lead Published",
        description: "Lead published to project management",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to publish lead",
      });
    },
  });

  // Bulk publish leads mutation
  const publishBulkMutation = useMutation({
    mutationFn: async (leadIds: string[]) => {
      return await apiRequest('POST', '/api/leads/publish-bulk', { leadIds });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      setSelectedLeads([]);
      toast({
        title: "Leads Published",
        description: `${data.publishedCount} lead(s) published to project management`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to bulk publish leads",
      });
    },
  });

  // Push to Client Dashboard - generic push for any campaign
  const [pushDashboardDialogOpen, setPushDashboardDialogOpen] = useState(false);
  const [pushDashboardAutoPublish, setPushDashboardAutoPublish] = useState(true);

  const pushToDashboardMutation = useMutation({
    mutationFn: async ({ campaignId, leadIds, autoPublish }: { campaignId?: string; leadIds?: string[]; autoPublish?: boolean }) => {
      const res = await apiRequest('POST', '/api/leads/push-to-client-dashboard', { campaignId, leadIds, autoPublish });
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      setPushDashboardDialogOpen(false);
      setSelectedLeads([]);
      toast({
        title: "Pushed to Client Dashboard",
        description: data.message || `${data.pushed} lead(s) pushed to client dashboard`,
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to push leads to client dashboard",
      });
    },
  });

  const handlePushToDashboard = () => {
    setPushDashboardDialogOpen(true);
  };

  const handleConfirmPushToDashboard = () => {
    if (selectedLeads.length > 0) {
      pushToDashboardMutation.mutate({ leadIds: selectedLeads, autoPublish: pushDashboardAutoPublish });
    } else if (filterCampaign) {
      pushToDashboardMutation.mutate({ campaignId: filterCampaign, autoPublish: pushDashboardAutoPublish });
    }
  };

  const syncRecordingMutation = useMutation({
    mutationFn: async (leadId: string) => {
      const res = await apiRequest('POST', `/api/leads/${leadId}/sync-recording`, {});
      return await res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      if (data.success) {
        toast({
          title: "Recording Synced",
          description: "Call recording retrieved from Telnyx successfully. Transcription will start automatically.",
        });
      } else {
        // Informational toast for expected "not found" outcome
        toast({
          title: "No Recording Found",
          description: "Could not find a call recording for this lead in Telnyx.",
        });
      }
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Sync Failed",
        description: error.message || "Failed to sync recording from Telnyx",
      });
    },
  });

  const reEvaluateQAMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const res = await apiRequest('POST', `/api/campaigns/${campaignId}/reevaluate-qa`, {});
      return await res.json();
    },
    onSuccess: (data: any) => {
      // Show success message for background processing
      toast({
        title: "Re-evaluation Started",
        description: data.note || "Re-evaluation is processing in the background. Refresh the page in a few minutes to see updated results.",
      });
      setSelectedCampaignForReeval("");
      
      // Auto-refresh leads after 30 seconds to show progress
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      }, 30000);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Re-evaluation Failed",
        description: error.message || "Failed to start re-evaluation",
      });
    },
  });

  const consolidatedProcessMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      const res = await apiRequest('POST', `/api/campaigns/${campaignId}/process-all`, {});
      return await res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Consolidated Processing Started",
        description: data.note || "All validation steps are running in background. This includes: AI QA Re-evaluation, Companies House Validation, Recording Sync, and Auto-approval. Refresh in a few minutes.",
      });
      setSelectedCampaignForReeval("");
      
      // Auto-refresh leads after 60 seconds to show progress
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      }, 60000);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Processing Failed",
        description: error.message || "Failed to start consolidated processing",
      });
    },
  });

  const validateCompanyMutation = useMutation({
    mutationFn: async (leadId: string) => {
      return await apiRequest('POST', `/api/leads/${leadId}/validate-company`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
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

  const getDeliveryBadge = (lead: LeadWithAccount) => {
    if (lead.deliveredAt) {
      return (
        <Badge variant="outline" className="bg-success/10 text-success border-success/20" data-testid={`badge-delivered-${lead.id}`}>
          <Package className="h-3 w-3 mr-1" />
          Delivered
        </Badge>
      );
    }
    if (lead.qaStatus === 'approved' || lead.qaStatus === 'published') {
      return (
        <Badge variant="secondary" data-testid={`badge-pending-delivery-${lead.id}`}>
          Pending Delivery
        </Badge>
      );
    }
    return null;
  };

  const getSubmissionBadge = (lead: LeadWithAccount) => {
    if (lead.submittedToClient && lead.submittedAt) {
      return (
        <Badge variant="outline" className="bg-info/10 text-info border-info/20" data-testid={`badge-submitted-${lead.id}`}>
          <Send className="h-3 w-3 mr-1" />
          Submitted
        </Badge>
      );
    }
    // Show "Ready to Submit" for published leads
    if (lead.qaStatus === 'published' && !lead.submittedToClient) {
      return (
        <Badge variant="outline" className="bg-success/10 text-success border-success/20" data-testid={`badge-ready-submit-${lead.id}`}>
          <Globe className="h-3 w-3 mr-1" />
          Ready to Submit
        </Badge>
      );
    }
    // Show "Pending Publish" for approved leads (not yet published)
    if (lead.qaStatus === 'approved' && !lead.submittedToClient) {
      return (
        <Badge variant="outline" className="bg-warning/10 text-warning border-warning/20" data-testid={`badge-pending-publish-${lead.id}`}>
          Pending Publish
        </Badge>
      );
    }
    return null;
  };

  const handleMarkDelivered = (leadId: string) => {
    setDeliveringLeadId(leadId);
    setDeliveryDialogOpen(true);
  };

  const handleMarkDeliveredBulk = () => {
    setDeliveringLeadId(null);
    setDeliveryDialogOpen(true);
  };

  const handleConfirmDelivery = () => {
    if (deliveringLeadId) {
      markDeliveredMutation.mutate({ id: deliveringLeadId, notes: deliveryNotes || undefined });
    } else if (selectedLeads.length > 0) {
      markDeliveredBulkMutation.mutate({ leadIds: selectedLeads, notes: deliveryNotes || undefined });
    }
  };

  const handleSubmitToClient = (leadId: string) => {
    setSubmittingLeadId(leadId);
    setSubmissionDialogOpen(true);
  };

  const handleSubmitToClientBulk = () => {
    setSubmittingLeadId(null);
    setSubmissionDialogOpen(true);
  };

  const handleConfirmSubmission = () => {
    if (submittingLeadId) {
      submitToClientMutation.mutate(submittingLeadId);
    } else if (selectedLeads.length > 0) {
      submitToClientBulkMutation.mutate(selectedLeads);
    }
  };

  const toggleLead = (id: string) => {
    setSelectedLeads(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleBulkApprove = async () => {
    for (const id of selectedLeads) {
      await approveMutation.mutateAsync(id);
    }
    setSelectedLeads([]);
  };

  const handleReject = (id: string) => {
    setRejectingLeadId(id);
    setRejectDialogOpen(true);
  };

  // Apply all filters
  // NOTE: For agent-only users, backend already filtered to their leads only, so skip agent filter
  const filteredLeads = leads.filter(l => {
    if (searchQuery && !l.contactName?.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !l.contactEmail?.toLowerCase().includes(searchQuery.toLowerCase()) &&
        !l.accountName?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    // Only apply agent filter for non-agent-only users (backend already filtered for agents)
    if (!isAgentOnly && filterAgent && l.agentId !== filterAgent) return false;
    if (filterCampaign && l.campaignId !== filterCampaign) return false;
    if (filterQAStatus && l.qaStatus !== filterQAStatus) return false;
    if (filterDeliveryStatus === 'pending' && l.deliveredAt) return false;
    if (filterDeliveryStatus === 'submitted' && !l.deliveredAt) return false;
    if (filterIndustry && l.accountIndustry !== filterIndustry) return false;
    if (filterCompany && !l.accountName?.toLowerCase().includes(filterCompany.toLowerCase())) return false;
    // Score filter - filter by minimum AI score threshold
    if (filterMinScore) {
      const minScoreValue = parseInt(filterMinScore, 10);
      const leadScore = l.aiScore ? parseFloat(String(l.aiScore)) : 0;
      if (leadScore < minScoreValue) return false;
    }
    return true;
  });

  const pendingLeads = filteredLeads.filter(l => l.qaStatus === 'new' || l.qaStatus === 'under_review');
  const approvedLeads = filteredLeads.filter(l => l.qaStatus === 'approved' || l.qaStatus === 'published');
  const pmReviewLeads = filteredLeads.filter(l => l.qaStatus === 'approved' || l.qaStatus === 'pending_pm_review');
  const rejectedLeads = filteredLeads.filter(l => l.qaStatus === 'rejected');

  const handleBulkExport = async () => {
    setExportLoading(true);
    try {
      const res = await apiRequest('POST', '/api/leads/bulk-export', {
        leadIds: filteredLeads.map(l => l.id),
        filters: {
          agent: filterAgent,
          campaign: filterCampaign,
          qaStatus: filterQAStatus,
          deliveryStatus: filterDeliveryStatus,
          industry: filterIndustry,
          company: filterCompany,
        }
      });
      const response = await res.json() as { csv: string; filename: string; count: number };
      
      // Create blob and download CSV
      const blob = new Blob([response.csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `leads-export-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Export Successful",
        description: `Exported ${filteredLeads.length} leads to CSV`,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Export Failed",
        description: error.message || "Failed to export leads",
      });
    } finally {
      setExportLoading(false);
    }
  };

  const activeFilters = [
    filterAgent ? `Agent: ${agents.find(a => a.id === filterAgent)?.firstName} ${agents.find(a => a.id === filterAgent)?.lastName}` : null,
    filterCampaign ? `Campaign: ${campaigns.find(c => c.id === filterCampaign)?.name || filterCampaign}` : null,
    filterQAStatus ? `QA: ${filterQAStatus}` : null,
    filterDeliveryStatus ? `Delivery: ${filterDeliveryStatus}` : null,
    filterMinScore ? `Score: ${filterMinScore}%+` : null,
    filterIndustry ? `Industry: ${filterIndustry}` : null,
    filterCompany ? `Company: ${filterCompany}` : null,
    filterDateFrom ? `From: ${filterDateFrom}` : null,
    filterDateTo ? `To: ${filterDateTo}` : null,
  ].filter(Boolean);

  const handleReEvaluateQA = () => {
    if (!selectedCampaignForReeval) {
      toast({
        variant: "destructive",
        title: "No Campaign Selected",
        description: "Please select a campaign to re-evaluate",
      });
      return;
    }
    reEvaluateQAMutation.mutate(selectedCampaignForReeval);
  };

  const handleConsolidatedProcess = () => {
    if (!selectedCampaignForReeval) {
      toast({
        variant: "destructive",
        title: "No Campaign Selected",
        description: "Please select a campaign to process",
      });
      return;
    }
    consolidatedProcessMutation.mutate(selectedCampaignForReeval);
  };

  const clearFilters = () => {
    setFilterAgent("");
    setFilterCampaign("");
    setFilterQAStatus("");
    setFilterDeliveryStatus("");
    setFilterMinScore("");
    setFilterIndustry("");
    setFilterCompany("");
    setFilterDateFrom("");
    setFilterDateTo("");
    setSearchQuery("");
  };

  const renderLeadsTable = (leadsData: LeadWithAccount[], showCheckbox = false, showActions = false) => {
    if (isLoading) {
      return (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                {showCheckbox && <TableHead className="w-[50px]"></TableHead>}
                <TableHead>Contact</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead>Agent / Caller</TableHead>
                <TableHead>Call Recording</TableHead>
                <TableHead>Tags</TableHead>
                <TableHead>AI Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                {showActions && <TableHead className="w-[200px]">Actions</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3].map((i) => (
                <TableRow key={i}>
                  {showCheckbox && <TableCell><Skeleton className="h-4 w-4" /></TableCell>}
                  <TableCell><Skeleton className="h-10 w-48" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-12" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-24" /></TableCell>
                  <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                  {showActions && <TableCell><Skeleton className="h-8 w-32" /></TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      );
    }

    if (leadsData.length === 0) {
      return (
        <EmptyState
          icon={Clock}
          title="No leads found"
          description="Leads will appear here once they're submitted for review."
        />
      );
    }

    return (
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              {showCheckbox && (
                <TableHead className="w-[50px]">
                  <Checkbox 
                    checked={selectedLeads.length === leadsData.length && leadsData.length > 0}
                    onCheckedChange={(checked) => {
                      setSelectedLeads(checked ? leadsData.map(l => l.id) : []);
                    }}
                    data-testid="checkbox-select-all"
                  />
                </TableHead>
              )}
              <TableHead>Contact</TableHead>
              <TableHead>Campaign</TableHead>
              <TableHead>Agent / Caller</TableHead>
              <TableHead>Call Recording</TableHead>
              <TableHead>Tags</TableHead>
              <TableHead>AI Score</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
              {showActions ? (
                <TableHead className="w-[200px]">Actions</TableHead>
              ) : (
                <TableHead className="w-[100px]"></TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {leadsData.map((lead) => {
              const initials = lead.contactName?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || '?';
              const agentName = getAgentDisplayName(lead);
              const agentInitials = agentName ? getAgentInitials(lead) : '?';
              
              return (
                <TableRow key={lead.id} data-testid={`row-lead-${lead.id}`}>
                  {showCheckbox && (
                    <TableCell>
                      <Checkbox
                        checked={selectedLeads.includes(lead.id)}
                        onCheckedChange={() => toggleLead(lead.id)}
                        data-testid={`checkbox-lead-${lead.id}`}
                      />
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback>{initials}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium" data-testid={`text-contact-name-${lead.id}`}>
                          {lead.contactName || 'Unknown'}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {lead.accountName || 'No company'}
                        </div>
                        <div className="text-sm text-muted-foreground font-mono">
                          {lead.contactEmail || 'No email'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell data-testid={`text-campaign-${lead.id}`}>
                    {lead.campaignId || '-'}
                  </TableCell>
                  <TableCell>
                    {agentName ? (
                      <div className="flex items-center gap-2">
                        <Avatar className="h-6 w-6">
                          <AvatarFallback className="text-xs">
                            {agentInitials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="text-sm">
                          <div className="font-medium" data-testid={`text-agent-name-${lead.id}`}>
                            {agentName}
                          </div>
                          {lead.agentEmail && (
                            <div className="text-xs text-muted-foreground font-mono">
                              {lead.agentEmail}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {lead.recordingUrl ? (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={isPlayingRecording(lead.id) ? "default" : "ghost"}
                          className="h-8 w-8 p-0"
                          onClick={() => handlePlayRecording(lead.id, lead.recordingUrl!)}
                          disabled={loadingRecordingId === lead.id}
                          data-testid={`button-play-recording-${lead.id}`}
                          title={loadingRecordingId === lead.id ? "Loading..." : isPlayingRecording(lead.id) ? "Pause recording" : "Play recording"}
                        >
                          {loadingRecordingId === lead.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : isPlayingRecording(lead.id) ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                        {lead.callDuration && (
                          <span className="text-sm text-muted-foreground font-mono">
                            {Math.floor(lead.callDuration / 60)}:{(lead.callDuration % 60).toString().padStart(2, '0')}
                          </span>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => window.open(lead.recordingUrl!, '_blank')}
                          data-testid={`button-download-recording-${lead.id}`}
                          title="Download recording"
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => syncRecordingMutation.mutate(lead.id)}
                          disabled={syncRecordingMutation.isPending}
                          data-testid={`button-sync-recording-${lead.id}`}
                          title="Fetch call recording from Telnyx by searching dialed number"
                        >
                          {syncRecordingMutation.isPending ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <RefreshCw className="mr-1 h-3 w-3" />
                          )}
                          Sync
                        </Button>
                        <span className="text-xs text-muted-foreground">No recording</span>
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1 items-center">
                      {(lead.tags || []).map((tag: LeadTag) => (
                        <Badge 
                          key={tag.id} 
                          variant="outline" 
                          className="text-xs cursor-pointer"
                          style={{ 
                            backgroundColor: tag.color + '20', 
                            borderColor: tag.color,
                            color: tag.color 
                          }}
                          onClick={() => removeTagMutation.mutate({ leadId: lead.id, tagId: tag.id })}
                          data-testid={`badge-tag-${lead.id}-${tag.id}`}
                          title="Click to remove tag"
                        >
                          {tag.name}
                          <X className="ml-1 h-3 w-3" />
                        </Badge>
                      ))}
                      {!isAgentOnly && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button 
                              size="icon" 
                              variant="ghost" 
                              className="h-6 w-6"
                              data-testid={`button-add-tag-${lead.id}`}
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-2" align="start">
                            <div className="space-y-1">
                              {availableTags.length === 0 ? (
                                <p className="text-xs text-muted-foreground p-2">No tags available</p>
                              ) : (
                                availableTags
                                  .filter(tag => !(lead.tags || []).some((t: LeadTag) => t.id === tag.id))
                                  .map(tag => (
                                    <Button
                                      key={tag.id}
                                      variant="ghost"
                                      size="sm"
                                      className="w-full justify-start text-xs"
                                      onClick={() => addTagMutation.mutate({ leadId: lead.id, tagId: tag.id })}
                                      data-testid={`button-apply-tag-${lead.id}-${tag.id}`}
                                    >
                                      <div 
                                        className="w-3 h-3 rounded-full mr-2" 
                                        style={{ backgroundColor: tag.color }}
                                      />
                                      {tag.name}
                                    </Button>
                                  ))
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start text-xs text-muted-foreground"
                                onClick={() => setTagDialogOpen(true)}
                                data-testid={`button-create-tag-${lead.id}`}
                              >
                                <Plus className="h-3 w-3 mr-2" />
                                Create new tag
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {lead.aiScore ? (
                      <Badge 
                        variant={parseFloat(String(lead.aiScore)) >= 50 ? "default" : "secondary"}
                        className={parseFloat(String(lead.aiScore)) >= 70 ? "bg-success" : parseFloat(String(lead.aiScore)) >= 50 ? "bg-warning" : ""}
                        data-testid={`badge-ai-score-${lead.id}`}
                      >
                        {parseFloat(String(lead.aiScore)).toFixed(0)}%
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {getStatusBadge(lead.qaStatus)}
                      {getSubmissionBadge(lead)}
                      {getDeliveryBadge(lead)}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground" data-testid={`text-submitted-${lead.id}`}>
                    {new Date(lead.createdAt).toLocaleDateString()}
                  </TableCell>
                  {showActions && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/leads/${lead.id}`)}
                          data-testid={`button-view-details-${lead.id}`}
                        >
                          <Eye className="mr-1 h-4 w-4" />
                          Details
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => validateCompanyMutation.mutate(lead.id)}
                          disabled={validateCompanyMutation.isPending}
                          data-testid={`button-validate-company-${lead.id}`}
                          title="Validate company with Companies House UK"
                        >
                          {validateCompanyMutation.isPending ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <Building2 className="mr-1 h-4 w-4" />
                          )}
                          Validate
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => approveMutation.mutate(lead.id)}
                          disabled={approveMutation.isPending}
                          data-testid={`button-approve-${lead.id}`}
                        >
                          <CheckCircle className="mr-1 h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleReject(lead.id)}
                          disabled={rejectMutation.isPending}
                          data-testid={`button-reject-${lead.id}`}
                        >
                          <XCircle className="mr-1 h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  )}
                  {!showActions && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/leads/${lead.id}`)}
                          data-testid={`button-view-details-${lead.id}`}
                        >
                          <Eye className="mr-1 h-4 w-4" />
                          Details
                        </Button>
                        {/* Publish button - for approved leads that aren't published yet */}
                        {lead.qaStatus === 'approved' && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => publishMutation.mutate(lead.id)}
                            disabled={publishMutation.isPending}
                            data-testid={`button-publish-${lead.id}`}
                          >
                            <Globe className="mr-1 h-4 w-4" />
                            Publish
                          </Button>
                        )}
                        {/* Submit to Client - for published leads only */}
                        {lead.qaStatus === 'published' && !lead.submittedToClient && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => handleSubmitToClient(lead.id)}
                            data-testid={`button-submit-to-client-${lead.id}`}
                          >
                            <Send className="mr-1 h-4 w-4" />
                            Submit to Client
                          </Button>
                        )}
                        {/* Push to Client Dashboard - for approved/published leads not yet on dashboard */}
                        {(lead.qaStatus === 'approved' || lead.qaStatus === 'published') && !lead.submittedToClient && (
                          <Button
                            size="sm"
                            variant="default"
                            className="bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => pushToDashboardMutation.mutate({ leadIds: [lead.id], autoPublish: true })}
                            disabled={pushToDashboardMutation.isPending}
                            data-testid={`button-push-dashboard-${lead.id}`}
                          >
                            <Globe className="mr-1 h-4 w-4" />
                            Push to Dashboard
                          </Button>
                        )}
                        {(lead.qaStatus === 'approved' || lead.qaStatus === 'published') && !lead.deliveredAt && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkDelivered(lead.id)}
                            data-testid={`button-mark-delivered-${lead.id}`}
                          >
                            <Package className="mr-1 h-4 w-4" />
                            Mark Delivered
                          </Button>
                        )}
                        {!isAgentOnly && (lead.qaStatus === 'approved' || lead.qaStatus === 'published') && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleReject(lead.id)}
                            disabled={rejectMutation.isPending}
                            data-testid={`button-reject-approved-${lead.id}`}
                          >
                            <XCircle className="mr-1 h-4 w-4" />
                            Reject
                          </Button>
                        )}
                        {!isAgentOnly && lead.qaStatus === 'rejected' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => approveMutation.mutate(lead.id)}
                            disabled={approveMutation.isPending}
                            data-testid={`button-approve-rejected-${lead.id}`}
                          >
                            <CheckCircle className="mr-1 h-4 w-4" />
                            Approve
                          </Button>
                        )}
                        {userRoles.includes('admin') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setDeletingLeadId(lead.id);
                              setDeleteDialogOpen(true);
                            }}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-${lead.id}`}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  const handleExportApproved = async () => {
    try {
      setExportLoading(true);
      const response = await fetch('/api/leads/export/approved', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to export leads');
      }
      
      // Get the CSV content and create a download
      const csvContent = await response.text();
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().split('T')[0];
      link.setAttribute('download', `approved-leads-${timestamp}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast({
        title: "Export Complete",
        description: "Approved leads with recording URLs downloaded successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Export Failed",
        description: error.message || "Failed to export approved leads",
        variant: "destructive",
      });
    } finally {
      setExportLoading(false);
    }
  };

  const handlePlayRecording = async (leadId: string, _recordingUrl: string) => {
    // If same recording, toggle play/pause
    if (playingLeadId === leadId && audioRef) {
      if (audioRef.paused) {
        audioRef.play();
      } else {
        audioRef.pause();
      }
      return;
    }

    // Stop current audio if playing different recording
    if (audioRef) {
      audioRef.pause();
      audioRef.currentTime = 0;
    }

    // Fetch fresh recording URL from backend (presigned URLs expire, backend auto-refreshes from Telnyx)
    setLoadingRecordingId(leadId);
    try {
      const response = await fetch(`/api/leads/${leadId}/recording-url`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });
      
      const data = await response.json();
      
      // Handle expired recordings that couldn't be refreshed (410 Gone)
      if (response.status === 410) {
        toast({
          title: "Recording Expired",
          description: "This recording has expired and could not be refreshed from Telnyx.",
          variant: "destructive",
        });
        return;
      }
      
      if (!response.ok || !data.url) {
        throw new Error(data.message || 'No recording URL available');
      }

      // Create new audio and play with fresh URL
      const audio = new Audio(data.url);
      audio.onended = () => setPlayingLeadId(null);
      audio.onpause = () => {
        if (audio.currentTime === 0) setPlayingLeadId(null);
      };
      audio.onerror = () => {
        toast({
          title: "Playback Error",
          description: "Failed to play recording. Please try syncing the recording again.",
          variant: "destructive",
        });
        setPlayingLeadId(null);
      };
      
      await audio.play();
      setAudioRef(audio);
      setPlayingLeadId(leadId);
    } catch (error: any) {
      console.error('Failed to fetch recording URL:', error);
      toast({
        title: "Recording Error",
        description: error.message || "Failed to load recording. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingRecordingId(null);
    }
  };

  const isPlayingRecording = (leadId: string) => {
    return playingLeadId === leadId && audioRef && !audioRef.paused;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-leads-qa">Leads & QA</h1>
          <p className="text-muted-foreground mt-1">
            Review, approve, and manage qualified leads
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleExportApproved} disabled={exportLoading} data-testid="button-download-approved">
            {exportLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Download Approved
          </Button>
          <Button onClick={handleBulkExport} disabled={exportLoading || filteredLeads.length === 0} data-testid="button-bulk-export-filtered" variant="outline">
            {exportLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Export Filtered
          </Button>
        </div>
      </div>

      {/* Comprehensive Filtering Controls */}
      <div className="border border-border/60 rounded-2xl p-5 bg-card/70 shadow-xs space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Search */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Search</label>
            <Input
              placeholder="Name, email, company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-filter-search"
            />
          </div>

          {/* Agent Filter */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Agent</label>
            <Select value={filterAgent || "all"} onValueChange={(val) => setFilterAgent(val === "all" ? "" : val)}>
              <SelectTrigger data-testid="select-filter-agent">
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agents.map((agent) => (
                  <SelectItem key={agent.id} value={agent.id}>
                    {agent.firstName} {agent.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Campaign Filter */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Campaign</label>
            <Select value={filterCampaign || "all"} onValueChange={(val) => setFilterCampaign(val === "all" ? "" : val)}>
              <SelectTrigger data-testid="select-filter-campaign">
                <SelectValue placeholder="All campaigns" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campaigns</SelectItem>
                {campaigns.map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* QA Status Filter */}
          <div className="space-y-1">
            <label className="text-sm font-medium">QA Status</label>
            <Select value={filterQAStatus || "all"} onValueChange={(val) => setFilterQAStatus(val === "all" ? "" : val)}>
              <SelectTrigger data-testid="select-filter-qa-status">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="under_review">Under Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="published">Published</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Delivery Status Filter */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Delivery Status</label>
            <Select value={filterDeliveryStatus || "all"} onValueChange={(val) => setFilterDeliveryStatus(val === "all" ? "" : val)}>
              <SelectTrigger data-testid="select-filter-delivery-status">
                <SelectValue placeholder="All deliveries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All deliveries</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="submitted">Submitted</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* AI Score Filter */}
          <div className="space-y-1">
            <label className="text-sm font-medium">AI Score</label>
            <Select value={filterMinScore || "all"} onValueChange={(val) => setFilterMinScore(val === "all" ? "" : val)}>
              <SelectTrigger data-testid="select-filter-min-score">
                <SelectValue placeholder="All scores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All scores</SelectItem>
                <SelectItem value="50">50%+ (Medium+)</SelectItem>
                <SelectItem value="60">60%+ (Good)</SelectItem>
                <SelectItem value="70">70%+ (Strong)</SelectItem>
                <SelectItem value="80">80%+ (Excellent)</SelectItem>
                <SelectItem value="90">90%+ (Outstanding)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Industry Filter */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Industry</label>
            <Select value={filterIndustry || "all"} onValueChange={(val) => setFilterIndustry(val === "all" ? "" : val)}>
              <SelectTrigger data-testid="select-filter-industry">
                <SelectValue placeholder="All industries" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All industries</SelectItem>
                {industries.map((industry) => (
                  <SelectItem key={industry.id} value={industry.name}>
                    {industry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Company Filter */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Company</label>
            <Input
              placeholder="Filter by company..."
              value={filterCompany}
              onChange={(e) => setFilterCompany(e.target.value)}
              data-testid="input-filter-company"
            />
          </div>

          {/* Date From Filter */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Date From</label>
            <Input
              type="date"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              data-testid="input-filter-date-from"
            />
          </div>

          {/* Date To Filter */}
          <div className="space-y-1">
            <label className="text-sm font-medium">Date To</label>
            <Input
              type="date"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              data-testid="input-filter-date-to"
            />
          </div>
        </div>

        {/* Active Filters Display & Clear Button */}
        {activeFilters.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border/60">
            <span className="text-sm text-muted-foreground">Active filters:</span>
            <div className="flex flex-wrap gap-2">
              {activeFilters.map((filter) => (
                <Badge key={filter} variant="secondary" className="flex items-center gap-1">
                  {filter}
                </Badge>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="ml-auto"
              data-testid="button-clear-filters"
            >
              <X className="h-4 w-4 mr-1" />
              Clear All
            </Button>
          </div>
        )}
      </div>

      {/* Campaign QA Parameters - Collapsible (shown when campaign is selected) */}
      {filterCampaign && selectedCampaignDetails && (selectedCampaignDetails.qaParameters || selectedCampaignDetails.customQaRules) && (
        <Collapsible open={showQAParameters} onOpenChange={setShowQAParameters} className="border border-border/60 rounded-2xl bg-card/70 shadow-xs">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" className="w-full justify-between p-4 h-auto hover:bg-muted/40" data-testid="button-toggle-campaign-qa-parameters">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <span className="font-medium">Campaign QA Parameters</span>
                <Badge variant="secondary" className="text-xs">{selectedCampaignDetails.name}</Badge>
              </div>
              {showQAParameters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Min Score */}
                {selectedCampaignDetails.qaParameters?.min_score && (
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-muted-foreground">Min Score</span>
                    <div>
                      <Badge variant="outline" className="text-base">{selectedCampaignDetails.qaParameters.min_score}%</Badge>
                    </div>
                  </div>
                )}

                {/* Target Job Titles */}
                {(selectedCampaignDetails.qaParameters?.client_criteria?.job_titles || []).length > 0 && (
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-muted-foreground">Target Job Titles</span>
                    <div className="flex flex-wrap gap-1">
                      {selectedCampaignDetails.qaParameters?.client_criteria?.job_titles?.map((title, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{title}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Target Seniority */}
                {(selectedCampaignDetails.qaParameters?.client_criteria?.seniority_levels || []).length > 0 && (
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-muted-foreground">Target Seniority</span>
                    <div className="flex flex-wrap gap-1">
                      {selectedCampaignDetails.qaParameters?.client_criteria?.seniority_levels?.map((level, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{level}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Target Industries */}
                {(selectedCampaignDetails.qaParameters?.client_criteria?.industries || []).length > 0 && (
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-muted-foreground">Target Industries</span>
                    <div className="flex flex-wrap gap-1">
                      {selectedCampaignDetails.qaParameters?.client_criteria?.industries?.map((industry, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">{industry}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Custom QA Fields */}
                {selectedCampaignDetails.customQaFields && selectedCampaignDetails.customQaFields.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-sm font-medium text-muted-foreground">Custom Fields to Extract</span>
                    <div className="flex flex-wrap gap-1">
                      {selectedCampaignDetails.customQaFields.map((field, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {field.label} ({field.type}){field.required && ' *'}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Custom QA Rules */}
              {selectedCampaignDetails.customQaRules && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">AI Qualification Rules</span>
                  </div>
                  <div className="bg-muted/50 p-3 rounded-md text-sm font-mono whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                    {selectedCampaignDetails.customQaRules}
                  </div>
                </div>
              )}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      <Tabs defaultValue={tabFromUrl || "review"} className="w-full">
        {/* Only show tab list when not accessed via PM Review direct link */}
        {tabFromUrl !== 'pm-review' && (
          <TabsList className="bg-card/70 border border-border/60">
            <TabsTrigger value="review" data-testid="tab-review">
              <Clock className="mr-2 h-4 w-4" />
              Pending Review ({pendingLeads.length})
            </TabsTrigger>
            <TabsTrigger value="approved" data-testid="tab-approved">
              <CheckCircle className="mr-2 h-4 w-4" />
              Approved ({approvedLeads.length})
            </TabsTrigger>
            <TabsTrigger value="rejected" data-testid="tab-rejected">
              <XCircle className="mr-2 h-4 w-4" />
              Rejected ({rejectedLeads.length})
            </TabsTrigger>
            {userRoles.includes('admin') && (
              <TabsTrigger value="deleted" data-testid="tab-deleted">
                <Trash2 className="mr-2 h-4 w-4" />
                Deleted ({deletedLeads.length})
              </TabsTrigger>
            )}
          </TabsList>
        )}

        <TabsContent value="review" className="space-y-4 mt-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-4 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search leads..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  data-testid="input-search-leads"
                />
              </div>
              <FilterBuilder
                entityType="contact"
                onApplyFilter={setFilterGroup}
                initialFilter={filterGroup}
                audienceScope={filterCampaign ? { campaignId: filterCampaign } : undefined}
              />
            </div>
            <div className="flex gap-2">
              {!isAgentOnly && selectedLeads.length > 0 && (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        variant="outline" 
                        disabled={bulkTagMutation.isPending}
                        data-testid="button-bulk-tag"
                      >
                        {bulkTagMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Tag className="mr-2 h-4 w-4" />
                        )}
                        Tag ({selectedLeads.length})
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {availableTags.length === 0 ? (
                        <DropdownMenuItem disabled>No tags available</DropdownMenuItem>
                      ) : (
                        availableTags.map(tag => (
                          <DropdownMenuItem 
                            key={tag.id}
                            onClick={() => bulkTagMutation.mutate({ leadIds: selectedLeads, tagId: tag.id })}
                            data-testid={`menu-bulk-tag-${tag.id}`}
                          >
                            <div 
                              className="w-3 h-3 rounded-full mr-2" 
                              style={{ backgroundColor: tag.color }}
                            />
                            {tag.name}
                          </DropdownMenuItem>
                        ))
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setTagDialogOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Create new tag
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button 
                    variant="outline" 
                    onClick={handleBulkApprove}
                    disabled={approveMutation.isPending}
                    data-testid="button-bulk-approve"
                  >
                    {approveMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="mr-2 h-4 w-4" />
                    )}
                    Approve ({selectedLeads.length})
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => setBulkUpdateDialogOpen(true)}
                    data-testid="button-bulk-update"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Update ({selectedLeads.length})
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={() => bulkExportMutation.mutate(selectedLeads)}
                    disabled={bulkExportMutation.isPending}
                    data-testid="button-bulk-export"
                  >
                    {bulkExportMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="mr-2 h-4 w-4" />
                    )}
                    Export ({selectedLeads.length})
                  </Button>
                  {userRoles.includes('admin') && (
                    <Button 
                      variant="destructive" 
                      onClick={() => setBulkDeleteDialogOpen(true)}
                      data-testid="button-bulk-delete"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete ({selectedLeads.length})
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>

          {!isAgentOnly && campaigns.length > 0 && (
            <div className="flex items-center gap-3 p-4 border rounded-lg bg-muted/30">
              <Sparkles className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium">Automated Lead Processing & Validation</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Select a campaign to run all validation steps: AI QA Re-evaluation, Companies House validation, Recording sync, and Auto-approval
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={selectedCampaignForReeval}
                  onValueChange={setSelectedCampaignForReeval}
                >
                  <SelectTrigger className="w-[250px]" data-testid="select-campaign-process">
                    <SelectValue placeholder="Select campaign..." />
                  </SelectTrigger>
                  <SelectContent>
                    {campaigns.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={handleConsolidatedProcess}
                  disabled={!selectedCampaignForReeval || consolidatedProcessMutation.isPending}
                  data-testid="button-process-all"
                >
                  {consolidatedProcessMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 h-4 w-4" />
                      Process All
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleReEvaluateQA}
                  disabled={!selectedCampaignForReeval || reEvaluateQAMutation.isPending}
                  data-testid="button-reevaluate-qa"
                >
                  {reEvaluateQAMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Re-evaluating...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Re-evaluate Only
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {isAgentOnly && (
            <div className="flex items-center gap-3 p-4 border rounded-lg bg-info/10">
              <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              <div className="flex-1">
                <p className="text-sm font-medium text-blue-900 dark:text-blue-100">View-Only Access</p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
                  You can view your leads here, but cannot approve or reject them. Contact a quality analyst or admin if you need to make changes.
                </p>
              </div>
            </div>
          )}

          {renderLeadsTable(pendingLeads, !isAgentOnly, !isAgentOnly)}
        </TabsContent>

        <TabsContent value="approved" className="mt-6 space-y-4">
          {!isAgentOnly && selectedLeads.length > 0 && (
            <div className="flex justify-end gap-2 flex-wrap">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    disabled={bulkTagMutation.isPending}
                    data-testid="button-bulk-tag-approved"
                  >
                    {bulkTagMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Tag className="mr-2 h-4 w-4" />
                    )}
                    Tag ({selectedLeads.length})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {availableTags.length === 0 ? (
                    <DropdownMenuItem disabled>No tags available</DropdownMenuItem>
                  ) : (
                    availableTags.map(tag => (
                      <DropdownMenuItem 
                        key={tag.id}
                        onClick={() => bulkTagMutation.mutate({ leadIds: selectedLeads, tagId: tag.id })}
                        data-testid={`menu-bulk-tag-approved-${tag.id}`}
                      >
                        <div 
                          className="w-3 h-3 rounded-full mr-2" 
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setTagDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create new tag
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                onClick={handleSubmitToClientBulk}
                disabled={submitToClientBulkMutation.isPending}
                variant="default"
                data-testid="button-bulk-submit-to-client"
              >
                {submitToClientBulkMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Submit to Client ({selectedLeads.length})
              </Button>
              <Button
                onClick={handlePushToDashboard}
                disabled={pushToDashboardMutation.isPending}
                variant="default"
                className="bg-emerald-600 hover:bg-emerald-700"
                data-testid="button-bulk-push-dashboard"
              >
                {pushToDashboardMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Globe className="mr-2 h-4 w-4" />
                )}
                Push to Client Dashboard ({selectedLeads.length})
              </Button>
              <Button
                onClick={handleMarkDeliveredBulk}
                disabled={markDeliveredBulkMutation.isPending}
                variant="outline"
                data-testid="button-bulk-mark-delivered"
              >
                {markDeliveredBulkMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Package className="mr-2 h-4 w-4" />
                )}
                Mark as Delivered ({selectedLeads.length})
              </Button>
              <Button
                variant="outline"
                onClick={() => setBulkUpdateDialogOpen(true)}
                data-testid="button-bulk-update-approved"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Update ({selectedLeads.length})
              </Button>
              <Button 
                variant="outline" 
                onClick={() => bulkExportMutation.mutate(selectedLeads)}
                disabled={bulkExportMutation.isPending}
                data-testid="button-bulk-export-approved"
              >
                {bulkExportMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Export ({selectedLeads.length})
              </Button>
              {userRoles.includes('admin') && (
                <Button 
                  variant="destructive" 
                  onClick={() => setBulkDeleteDialogOpen(true)}
                  data-testid="button-bulk-delete-approved"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete ({selectedLeads.length})
                </Button>
              )}
            </div>
          )}
          {/* Campaign-level Push to Dashboard - shown when campaign is filtered */}
          {!isAgentOnly && filterCampaign && selectedLeads.length === 0 && (
            <Card className="border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
              <CardContent className="py-3 px-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-emerald-600" />
                  <span className="text-sm text-emerald-800 dark:text-emerald-200">
                    Push all qualified leads for this campaign to the client dashboard
                  </span>
                </div>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700"
                  onClick={handlePushToDashboard}
                  disabled={pushToDashboardMutation.isPending}
                  data-testid="button-campaign-push-dashboard"
                >
                  {pushToDashboardMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Globe className="mr-2 h-4 w-4" />
                  )}
                  Push All to Client Dashboard
                </Button>
              </CardContent>
            </Card>
          )}
          {renderLeadsTable(approvedLeads, !isAgentOnly, false)}
        </TabsContent>

        {/* PM Review Tab - Project Management final approval before client portal */}
        {(userRoles.includes('admin') || userRoles.includes('campaign_manager')) && (
          <TabsContent value="pm-review" className="mt-6 space-y-4">
            <Card className="mb-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
                  Project Management Review
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  These leads have been approved by QA and are awaiting final PM review before publishing to the client portal.
                  Approve to submit to client or reject to return to QA team.
                </p>
              </CardContent>
            </Card>
            
            {selectedLeads.length > 0 && (
              <div className="flex justify-end gap-2 flex-wrap">
                <Button
                  onClick={() => bulkPmApproveMutation.mutate(selectedLeads)}
                  disabled={bulkPmApproveMutation.isPending}
                  variant="default"
                  data-testid="button-bulk-pm-approve"
                >
                  {bulkPmApproveMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle className="mr-2 h-4 w-4" />
                  )}
                  PM Approve & Publish ({selectedLeads.length})
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => bulkExportMutation.mutate(selectedLeads)}
                  disabled={bulkExportMutation.isPending}
                  data-testid="button-bulk-export-pm-review"
                >
                  {bulkExportMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Export ({selectedLeads.length})
                </Button>
              </div>
            )}
            
            {/* PM Review Table */}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]">
                      <Checkbox
                        checked={pmReviewLeads.length > 0 && selectedLeads.length === pmReviewLeads.length}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedLeads(pmReviewLeads.map(l => l.id));
                          } else {
                            setSelectedLeads([]);
                          }
                        }}
                        aria-label="Select all PM review leads"
                      />
                    </TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>QA Status</TableHead>
                    <TableHead>QA Approved By</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pmReviewLeads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No leads pending PM review
                      </TableCell>
                    </TableRow>
                  ) : (
                    pmReviewLeads.map((lead) => (
                      <TableRow key={lead.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedLeads.includes(lead.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedLeads([...selectedLeads, lead.id]);
                              } else {
                                setSelectedLeads(selectedLeads.filter(id => id !== lead.id));
                              }
                            }}
                            aria-label={`Select ${lead.firstName} ${lead.lastName}`}
                          />
                        </TableCell>
                        <TableCell>
                          <button
                            className="flex items-center gap-2 hover:underline cursor-pointer"
                            onClick={() => navigate(`/leads/${lead.id}`)}
                          >
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                {(lead.firstName?.[0] || '') + (lead.lastName?.[0] || '')}
                              </AvatarFallback>
                            </Avatar>
                            <div className="text-left">
                              <div className="font-medium">{lead.firstName} {lead.lastName}</div>
                              <div className="text-xs text-muted-foreground">{lead.title}</div>
                            </div>
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            {lead.accountName || '-'}
                          </div>
                        </TableCell>
                        <TableCell>{lead.campaignName || '-'}</TableCell>
                        <TableCell>
                          <Badge variant={lead.qaStatus === 'approved' ? 'default' : 'secondary'}>
                            {lead.qaStatus === 'approved' ? 'QA Approved' : 'Pending PM'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            {lead.approvedAt ? (
                              <>
                                <div>{new Date(lead.approvedAt).toLocaleDateString()}</div>
                                <div className="text-xs text-muted-foreground">by QA Team</div>
                              </>
                            ) : '-'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => pmApproveMutation.mutate(lead.id)}
                              disabled={pmApproveMutation.isPending}
                              data-testid={`button-pm-approve-${lead.id}`}
                            >
                              {pmApproveMutation.isPending ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle className="mr-1 h-4 w-4" />
                                  Approve
                                </>
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setPmRejectingLeadId(lead.id);
                                setPmRejectDialogOpen(true);
                              }}
                              data-testid={`button-pm-reject-${lead.id}`}
                            >
                              <RotateCcw className="mr-1 h-4 w-4" />
                              Return to QA
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => navigate(`/leads/${lead.id}`)}
                              data-testid={`button-view-${lead.id}`}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        )}

        <TabsContent value="rejected" className="mt-6 space-y-4">
          {!isAgentOnly && selectedLeads.length > 0 && (
            <div className="flex justify-end gap-2 flex-wrap">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="outline" 
                    disabled={bulkTagMutation.isPending}
                    data-testid="button-bulk-tag-rejected"
                  >
                    {bulkTagMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Tag className="mr-2 h-4 w-4" />
                    )}
                    Tag ({selectedLeads.length})
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {availableTags.length === 0 ? (
                    <DropdownMenuItem disabled>No tags available</DropdownMenuItem>
                  ) : (
                    availableTags.map(tag => (
                      <DropdownMenuItem 
                        key={tag.id}
                        onClick={() => bulkTagMutation.mutate({ leadIds: selectedLeads, tagId: tag.id })}
                        data-testid={`menu-bulk-tag-rejected-${tag.id}`}
                      >
                        <div 
                          className="w-3 h-3 rounded-full mr-2" 
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setTagDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create new tag
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button 
                variant="outline" 
                onClick={() => setBulkUpdateDialogOpen(true)}
                data-testid="button-bulk-update-rejected"
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Update ({selectedLeads.length})
              </Button>
              <Button 
                variant="outline" 
                onClick={() => bulkExportMutation.mutate(selectedLeads)}
                disabled={bulkExportMutation.isPending}
                data-testid="button-bulk-export-rejected"
              >
                {bulkExportMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Export ({selectedLeads.length})
              </Button>
              {userRoles.includes('admin') && (
                <Button 
                  variant="destructive" 
                  onClick={() => setBulkDeleteDialogOpen(true)}
                  data-testid="button-bulk-delete-rejected"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete ({selectedLeads.length})
                </Button>
              )}
            </div>
          )}
          {renderLeadsTable(rejectedLeads, !isAgentOnly, false)}
        </TabsContent>

        {/* Deleted Leads Tab - Admin Only */}
        {userRoles.includes('admin') && (
          <TabsContent value="deleted" className="mt-6 space-y-4">
            {selectedLeads.length > 0 && (
              <div className="flex justify-end gap-2">
                <Button
                  onClick={() => bulkRestoreMutation.mutate(selectedLeads)}
                  disabled={bulkRestoreMutation.isPending}
                  variant="default"
                  data-testid="button-bulk-restore"
                >
                  {bulkRestoreMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="mr-2 h-4 w-4" />
                  )}
                  Restore ({selectedLeads.length})
                </Button>
              </div>
            )}
            
            {deletedLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : deletedLeads.length === 0 ? (
              <EmptyState
                icon={Trash2}
                title="No Deleted Leads"
                description="Leads that you delete will appear here. You can restore them if needed."
              />
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={deletedLeads.length > 0 && selectedLeads.length === deletedLeads.length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedLeads(deletedLeads.map(l => l.id));
                            } else {
                              setSelectedLeads([]);
                            }
                          }}
                          data-testid="checkbox-select-all-deleted"
                        />
                      </TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Previous Status</TableHead>
                      <TableHead>Deleted</TableHead>
                      <TableHead className="w-24">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {deletedLeads.map((lead) => (
                      <TableRow key={lead.id} data-testid={`row-deleted-lead-${lead.id}`}>
                        <TableCell>
                          <Checkbox
                            checked={selectedLeads.includes(lead.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedLeads([...selectedLeads, lead.id]);
                              } else {
                                setSelectedLeads(selectedLeads.filter(id => id !== lead.id));
                              }
                            }}
                            data-testid={`checkbox-deleted-lead-${lead.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                                {lead.contactName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{lead.contactName || 'Unknown'}</p>
                              <p className="text-xs text-muted-foreground">{lead.contactEmail || 'No email'}</p>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span>{lead.accountName || 'Unknown'}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            lead.qaStatus === 'approved' ? 'default' :
                            lead.qaStatus === 'rejected' ? 'destructive' :
                            'secondary'
                          }>
                            {lead.qaStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">
                            <p>{(lead as any).deletedAt ? new Date((lead as any).deletedAt).toLocaleDateString() : 'Unknown'}</p>
                            {(lead as any).deleterFirstName && (
                              <p className="text-xs text-muted-foreground">
                                by {(lead as any).deleterFirstName} {(lead as any).deleterLastName}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => restoreLeadMutation.mutate(lead.id)}
                            disabled={restoreLeadMutation.isPending}
                            data-testid={`button-restore-lead-${lead.id}`}
                          >
                            {restoreLeadMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <RotateCcw className="mr-1 h-4 w-4" />
                                Restore
                              </>
                            )}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {/* Lead Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" data-testid="dialog-lead-detail">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Lead Details: {selectedLead?.contactName}
            </DialogTitle>
            <DialogDescription>
              Review complete lead information, QA checklist, and AI analysis
            </DialogDescription>
          </DialogHeader>

          {selectedLead && (
            <div className="space-y-6">
              {/* Contact & Account Info */}
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold">Contact Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Name:</span>{' '}
                      <span className="font-medium" data-testid="text-contact-name">{selectedLead.contactName}</span>
                    </div>
                    {selectedLead.contactTitle && (
                      <div>
                        <span className="text-muted-foreground">Job Title:</span>{' '}
                        <span data-testid="text-contact-title">{selectedLead.contactTitle}</span>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Email:</span>{' '}
                      <span data-testid="text-contact-email">{selectedLead.contactEmail}</span>
                    </div>
                    {selectedLead.dialedNumber && (
                      <div>
                        <span className="text-muted-foreground">Phone Called:</span>{' '}
                        <span className="font-medium" data-testid="text-phone-called">{selectedLead.dialedNumber}</span>
                      </div>
                    )}
                    {(selectedLead.contactCity || selectedLead.contactState || selectedLead.contactCountry) && (
                      <div>
                        <span className="text-muted-foreground">Location:</span>{' '}
                        <span data-testid="text-contact-location">
                          {[selectedLead.contactCity, selectedLead.contactState, selectedLead.contactCountry].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
                    {selectedLead.contactLinkedin && (
                      <div>
                        <span className="text-muted-foreground">LinkedIn:</span>{' '}
                        <a 
                          href={selectedLead.contactLinkedin} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                          data-testid="link-contact-linkedin"
                        >
                          Profile
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">Account Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Account Name:</span>{' '}
                      <span className="font-medium" data-testid="text-account-name">{selectedLead.accountName || '-'}</span>
                    </div>
                    {(selectedLead.accountCity || selectedLead.accountState || selectedLead.accountCountry) && (
                      <div>
                        <span className="text-muted-foreground">Location:</span>{' '}
                        <span data-testid="text-account-location">
                          {[selectedLead.accountCity, selectedLead.accountState, selectedLead.accountCountry].filter(Boolean).join(', ')}
                        </span>
                      </div>
                    )}
                    {selectedLead.accountRevenueRange && (
                      <div>
                        <span className="text-muted-foreground">Revenue Range:</span>{' '}
                        <span data-testid="text-account-revenue">{selectedLead.accountRevenueRange}</span>
                      </div>
                    )}
                    {selectedLead.accountEmployeesRange && (
                      <div>
                        <span className="text-muted-foreground">Employee Size:</span>{' '}
                        <span data-testid="text-account-employees">{selectedLead.accountEmployeesRange}</span>
                      </div>
                    )}
                    {selectedLead.accountIndustry && (
                      <div>
                        <span className="text-muted-foreground">Industry:</span>{' '}
                        <span data-testid="text-account-industry">{selectedLead.accountIndustry}</span>
                      </div>
                    )}
                    {selectedLead.accountLinkedin && (
                      <div>
                        <span className="text-muted-foreground">LinkedIn:</span>{' '}
                        <a 
                          href={selectedLead.accountLinkedin} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                          data-testid="link-account-linkedin"
                        >
                          Company Page
                        </a>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Agent / Caller Info */}
              {(() => {
                              const agentName = getAgentDisplayName(selectedLead);
                              if (!agentName) return null;
                              const initials = getAgentInitials(selectedLead);
                              return (
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-10 w-10">
                                    <AvatarFallback>
                                      {initials}
                                    </AvatarFallback>
                                  </Avatar>
                                  <div>
                                    <div className="font-medium">{agentName}</div>
                                    {selectedLead.agentEmail && (
                                      <div className="text-xs text-muted-foreground font-mono">{selectedLead.agentEmail}</div>
                                    )}
                                  </div>
                                </div>
                              );
                            })() || null
                          }

              {/* Agent / Caller Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Agent / Caller</CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedLead.agentFirstName || selectedLead.agentLastName ? (
                    <div className="flex items-center gap-3">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback>
                          {`${selectedLead.agentFirstName?.[0] || ''}${selectedLead.agentLastName?.[0] || ''}`.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">{`${selectedLead.agentFirstName || ''} ${selectedLead.agentLastName || ''}`.trim()}</div>
                        <div className="text-xs text-muted-foreground font-mono">{selectedLead.agentEmail}</div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">No agent assigned</div>
                  )}
                </CardContent>
              </Card>

              {/* Call Recording & Duration */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Call Recording</h3>
                {selectedLead.recordingUrl ? (
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      onClick={() => window.open(selectedLead.recordingUrl!, '_blank')}
                      data-testid="button-play-recording-detail"
                    >
                      <Play className="mr-2 h-4 w-4" />
                      Play Recording
                    </Button>
                    {selectedLead.callDuration && (
                      <span className="text-sm text-muted-foreground">
                        Duration: {Math.floor(selectedLead.callDuration / 60)}:{(selectedLead.callDuration % 60).toString().padStart(2, '0')}
                      </span>
                    )}
                  </div>
                ) : selectedLead.callAttemptId ? (
                  <div className="flex items-center gap-4">
                    <Button
                      variant="outline"
                      onClick={() => syncRecordingMutation.mutate(selectedLead.id)}
                      disabled={syncRecordingMutation.isPending}
                      data-testid="button-fetch-recording-dialog"
                    >
                      <RefreshCw className={`mr-2 h-4 w-4 ${syncRecordingMutation.isPending ? 'animate-spin' : ''}`} />
                      Fetch Recording
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Recording not yet available
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No recording available for this lead</p>
                )}
              </div>

              {/* AI Analysis */}
              {(selectedLead.aiScore || selectedLead.aiQualificationStatus) && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">AI Analysis</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {selectedLead.aiScore && (
                      <div>
                        <span className="text-muted-foreground text-sm">AI Score:</span>
                        <div className="text-2xl font-bold text-primary">{selectedLead.aiScore}/100</div>
                      </div>
                    )}
                    {selectedLead.aiQualificationStatus && (
                      <div>
                        <span className="text-muted-foreground text-sm">AI Status:</span>
                        <Badge className="mt-1">{selectedLead.aiQualificationStatus}</Badge>
                      </div>
                    )}
                  </div>
                  {selectedLead.aiAnalysis && typeof selectedLead.aiAnalysis === 'object' && (
                    <div className="mt-2 p-3 bg-muted rounded-md">
                      <pre className="text-xs overflow-auto">{JSON.stringify(selectedLead.aiAnalysis, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}

              {/* Transcript */}
              {selectedLead.transcript && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Call Transcript</h3>
                  <div className="p-3 bg-muted rounded-md max-h-40 overflow-y-auto">
                    <p className="text-sm whitespace-pre-wrap">{selectedLead.transcript}</p>
                  </div>
                </div>
              )}

              {/* QA Checklist */}
              {selectedLead.checklistJson && typeof selectedLead.checklistJson === 'object' && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">QA Checklist</h3>
                  <div className="space-y-2">
                    {Object.entries(selectedLead.checklistJson as Record<string, any>).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-2">
                        <Checkbox
                          checked={!!value}
                          disabled
                          data-testid={`checkbox-qa-${key}`}
                        />
                        <span className="text-sm">{key}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              {selectedLead.notes && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Agent Notes</h3>
                  <div className="p-3 bg-muted rounded-md">
                    <p className="text-sm whitespace-pre-wrap">{selectedLead.notes}</p>
                  </div>
                </div>
              )}

              {/* Actions */}
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => setDetailDialogOpen(false)}
                  data-testid="button-close-detail"
                >
                  Close
                </Button>
                {selectedLead.qaStatus === 'new' && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => {
                        handleReject(selectedLead.id);
                        setDetailDialogOpen(false);
                      }}
                      data-testid="button-reject-from-detail"
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Reject
                    </Button>
                    <Button
                      onClick={() => {
                        approveMutation.mutate(selectedLead.id);
                        setDetailDialogOpen(false);
                      }}
                      disabled={approveMutation.isPending}
                      data-testid="button-approve-from-detail"
                    >
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Approve Lead
                    </Button>
                  </>
                )}
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent data-testid="dialog-reject-lead">
          <DialogHeader>
            <DialogTitle>Reject Lead</DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this lead
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter rejection reason..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={4}
            data-testid="textarea-reject-reason"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false);
                setRejectReason("");
                setRejectingLeadId(null);
              }}
              data-testid="button-cancel-reject"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (rejectingLeadId && rejectReason.trim()) {
                  rejectMutation.mutate({ id: rejectingLeadId, reason: rejectReason });
                }
              }}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              variant="destructive"
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Reject Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PM Reject Dialog - Return lead to QA */}
      <Dialog open={pmRejectDialogOpen} onOpenChange={setPmRejectDialogOpen}>
        <DialogContent data-testid="dialog-pm-reject-lead">
          <DialogHeader>
            <DialogTitle>Return Lead to QA</DialogTitle>
            <DialogDescription>
              This lead will be returned to the QA team for additional review.
              Provide feedback on what needs to be addressed.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Enter reason for returning to QA..."
            value={pmRejectReason}
            onChange={(e) => setPmRejectReason(e.target.value)}
            rows={4}
            data-testid="textarea-pm-reject-reason"
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setPmRejectDialogOpen(false);
                setPmRejectReason("");
                setPmRejectingLeadId(null);
              }}
              data-testid="button-cancel-pm-reject"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (pmRejectingLeadId && pmRejectReason.trim()) {
                  pmRejectMutation.mutate({ id: pmRejectingLeadId, reason: pmRejectReason });
                }
              }}
              disabled={!pmRejectReason.trim() || pmRejectMutation.isPending}
              variant="outline"
              data-testid="button-confirm-pm-reject"
            >
              {pmRejectMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <RotateCcw className="mr-2 h-4 w-4" />
              Return to QA
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
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeletingLeadId(null);
              }}
              data-testid="button-cancel-delete"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (deletingLeadId) {
                  deleteMutation.mutate(deletingLeadId);
                }
              }}
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

      {/* Create Tag Dialog */}
      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent data-testid="dialog-create-tag">
          <DialogHeader>
            <DialogTitle>Create New Tag</DialogTitle>
            <DialogDescription>
              Create a colored tag to organize and categorize your leads.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Tag Name</label>
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="e.g., High Priority, Follow Up, Hot Lead"
                data-testid="input-tag-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tag Color</label>
              <div className="flex gap-2 flex-wrap">
                {['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#64748b'].map(color => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-full border-2 ${newTagColor === color ? 'border-foreground' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewTagColor(color)}
                    data-testid={`button-color-${color}`}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm text-muted-foreground">Custom:</span>
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  className="h-8 w-12 cursor-pointer"
                  data-testid="input-tag-color"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Preview:</span>
              <Badge 
                variant="outline" 
                style={{ 
                  backgroundColor: newTagColor + '20', 
                  borderColor: newTagColor,
                  color: newTagColor 
                }}
              >
                {newTagName || 'Tag Name'}
              </Badge>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTagDialogOpen(false);
                setNewTagName("");
                setNewTagColor("#6366f1");
              }}
              data-testid="button-cancel-tag"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (newTagName.trim()) {
                  createTagMutation.mutate({ name: newTagName.trim(), color: newTagColor });
                }
              }}
              disabled={createTagMutation.isPending || !newTagName.trim()}
              data-testid="button-create-tag-confirm"
            >
              {createTagMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Create Tag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Submit to Client Dialog */}
      <Dialog open={submissionDialogOpen} onOpenChange={setSubmissionDialogOpen}>
        <DialogContent data-testid="dialog-submit-to-client">
          <DialogHeader>
            <DialogTitle>Submit Lead{selectedLeads.length > 1 && 's'} to Client</DialogTitle>
            <DialogDescription>
              {submittingLeadId 
                ? "This will automatically submit the lead to the client's UKEF landing page with validated UK company data." 
                : `This will submit ${selectedLeads.length} lead(s) to the client's UKEF landing page. Only leads with validated UK company data will be submitted.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="font-medium">Required validations:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>UK company registration (Companies House)</li>
              <li>Active company status</li>
              <li>Legal company name</li>
              <li>Annual revenue data</li>
              <li>Contact details (name, email, phone, job title)</li>
            </ul>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSubmissionDialogOpen(false);
                setSubmittingLeadId(null);
              }}
              data-testid="button-cancel-submission"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmSubmission}
              disabled={submitToClientMutation.isPending || submitToClientBulkMutation.isPending}
              data-testid="button-confirm-submission"
            >
              {(submitToClientMutation.isPending || submitToClientBulkMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <Send className="mr-2 h-4 w-4" />
              Submit to Client
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Push to Client Dashboard Dialog */}
      <Dialog open={pushDashboardDialogOpen} onOpenChange={setPushDashboardDialogOpen}>
        <DialogContent data-testid="dialog-push-dashboard">
          <DialogHeader>
            <DialogTitle>Push Leads to Client Dashboard</DialogTitle>
            <DialogDescription>
              {selectedLeads.length > 0
                ? `This will push ${selectedLeads.length} selected lead(s) to the client dashboard, making them visible in the client portal.`
                : filterCampaign
                  ? "This will push all qualified leads for the selected campaign to the client dashboard."
                  : "Select leads or filter by campaign to push leads to the client dashboard."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2 text-sm">
              <p className="font-medium">What this does:</p>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Marks leads as submitted so they appear in the client portal</li>
                <li>Auto-creates client campaign access if needed</li>
                <li>Works for any campaign — no external form required</li>
              </ul>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="autoPublish"
                checked={pushDashboardAutoPublish}
                onCheckedChange={(checked) => setPushDashboardAutoPublish(checked === true)}
              />
              <label htmlFor="autoPublish" className="text-sm cursor-pointer">
                Auto-publish approved leads first (publish + push in one step)
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPushDashboardDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmPushToDashboard}
              disabled={pushToDashboardMutation.isPending || (!selectedLeads.length && !filterCampaign)}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {pushToDashboardMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <Globe className="mr-2 h-4 w-4" />
              Push to Client Dashboard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark as Delivered Dialog */}
      <Dialog open={deliveryDialogOpen} onOpenChange={setDeliveryDialogOpen}>
        <DialogContent data-testid="dialog-mark-delivered">
          <DialogHeader>
            <DialogTitle>Mark Lead{selectedLeads.length > 1 && 's'} as Delivered</DialogTitle>
            <DialogDescription>
              {deliveringLeadId 
                ? "Mark this lead as delivered to client" 
                : `Mark ${selectedLeads.length} lead(s) as delivered to client`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">Delivery Notes (Optional)</label>
              <Textarea
                placeholder="Add any notes about the delivery..."
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                rows={3}
                data-testid="textarea-delivery-notes"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDeliveryDialogOpen(false);
                setDeliveryNotes("");
                setDeliveringLeadId(null);
              }}
              data-testid="button-cancel-delivery"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDelivery}
              disabled={markDeliveredMutation.isPending || markDeliveredBulkMutation.isPending}
              data-testid="button-confirm-delivery"
            >
              {(markDeliveredMutation.isPending || markDeliveredBulkMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <Package className="mr-2 h-4 w-4" />
              Mark as Delivered
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Dialog */}
      <Dialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <DialogContent data-testid="dialog-bulk-delete">
          <DialogHeader>
            <DialogTitle>Delete {selectedLeads.length} Lead{selectedLeads.length !== 1 ? 's' : ''}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedLeads.length} lead{selectedLeads.length !== 1 ? 's' : ''}? 
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setBulkDeleteDialogOpen(false)}
              data-testid="button-cancel-bulk-delete"
            >
              Cancel
            </Button>
            <Button
              onClick={() => bulkDeleteMutation.mutate(selectedLeads)}
              disabled={bulkDeleteMutation.isPending}
              variant="destructive"
              data-testid="button-confirm-bulk-delete"
            >
              {bulkDeleteMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              <Trash2 className="mr-2 h-4 w-4" />
              Delete {selectedLeads.length} Lead{selectedLeads.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Update Dialog */}
      <Dialog open={bulkUpdateDialogOpen} onOpenChange={setBulkUpdateDialogOpen}>
        <DialogContent data-testid="dialog-bulk-update">
          <DialogHeader>
            <DialogTitle>Update {selectedLeads.length} Lead{selectedLeads.length !== 1 ? 's' : ''}</DialogTitle>
            <DialogDescription>
              Update QA status or assign agent for the selected leads.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">QA Status</label>
              <Select value={bulkUpdateStatus || "none"} onValueChange={(val) => setBulkUpdateStatus(val === "none" ? "" : val)}>
                <SelectTrigger data-testid="select-bulk-update-status">
                  <SelectValue placeholder="Select status..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No change</SelectItem>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Assign Agent</label>
              <Select value={bulkUpdateAgent || "none"} onValueChange={(val) => setBulkUpdateAgent(val === "none" ? "" : val)}>
                <SelectTrigger data-testid="select-bulk-update-agent">
                  <SelectValue placeholder="Select agent..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No change</SelectItem>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.firstName} {agent.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setBulkUpdateDialogOpen(false);
                setBulkUpdateStatus("");
                setBulkUpdateAgent("");
              }}
              data-testid="button-cancel-bulk-update"
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const updates: { qaStatus?: string; agentId?: string } = {};
                if (bulkUpdateStatus) updates.qaStatus = bulkUpdateStatus;
                if (bulkUpdateAgent) updates.agentId = bulkUpdateAgent;
                if (Object.keys(updates).length > 0) {
                  bulkUpdateMutation.mutate({ leadIds: selectedLeads, updates });
                }
              }}
              disabled={bulkUpdateMutation.isPending || (!bulkUpdateStatus && !bulkUpdateAgent)}
              data-testid="button-confirm-bulk-update"
            >
              {bulkUpdateMutation.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Update {selectedLeads.length} Lead{selectedLeads.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
