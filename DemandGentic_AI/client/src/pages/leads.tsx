import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, CheckCircle, XCircle, Clock, Download, Loader2, Phone, Play, Pause, Eye, User, RefreshCw, Sparkles, Building2, Package, Send, X, Trash2, Tag, Plus, RotateCcw, Target, ChevronDown, ChevronUp, Globe, Briefcase, AlertTriangle } from "lucide-react";
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
import { useExportAuthority } from "@/hooks/use-export-authority";
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
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingLeadId, setRejectingLeadId] = useState(null);
  const [pmRejectDialogOpen, setPmRejectDialogOpen] = useState(false);
  const [pmRejectReason, setPmRejectReason] = useState("");
  const [pmRejectingLeadId, setPmRejectingLeadId] = useState(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedLead, setSelectedLead] = useState(null);
  const [filterGroup, setFilterGroup] = useState(undefined);
  const [playingLeadId, setPlayingLeadId] = useState(null);
  const [audioRef, setAudioRef] = useState(null);
  const [loadingRecordingId, setLoadingRecordingId] = useState(null);
  const [selectedCampaignForReeval, setSelectedCampaignForReeval] = useState("");
  const [deliveryDialogOpen, setDeliveryDialogOpen] = useState(false);
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [deliveringLeadId, setDeliveringLeadId] = useState(null);
  const [submissionDialogOpen, setSubmissionDialogOpen] = useState(false);
  const [submittingLeadId, setSubmittingLeadId] = useState(null);
  const [filterAgent, setFilterAgent] = useState("");
  const [filterCampaign, setFilterCampaign] = useState("");
  const [filterQAStatus, setFilterQAStatus] = useState("");
  const [filterDeliveryStatus, setFilterDeliveryStatus] = useState("");
  const [filterIndustry, setFilterIndustry] = useState("");
  const [filterCompany, setFilterCompany] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterMinScore, setFilterMinScore] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [bulkUpdateDialogOpen, setBulkUpdateDialogOpen] = useState(false);
  const [bulkUpdateStatus, setBulkUpdateStatus] = useState("");
  const [bulkUpdateAgent, setBulkUpdateAgent] = useState("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingLeadId, setDeletingLeadId] = useState(null);
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState("#6366f1");
  const [showQAParameters, setShowQAParameters] = useState(false);
  const { toast} = useToast();
  const { user } = useAuth();
  const { canExportData } = useExportAuthority();

  // Get user roles (support both legacy single role and new multi-role system)
  const userRoles = (user as any)?.roles || [user?.role || ''];
  
  // Check if user is agent-only (has agent role but no elevated roles)
  const isAgentOnly = userRoles.includes('agent') && 
                      !userRoles.includes('admin') && 
                      !userRoles.includes('campaign_manager') && 
                      !userRoles.includes('quality_analyst');

  const { data: leads = [], isLoading } = useQuery({
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
  const { data: campaigns = [] } = useQuery>({
    queryKey: ['/api/campaigns'],
  });

  // Build campaign ID -> name lookup
  const campaignNameMap = useMemo(() => {
    const map = new Map();
    for (const c of campaigns) map.set(c.id, c.name);
    return map;
  }, [campaigns]);

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
  const { data: selectedCampaignDetails } = useQuery;
      client_criteria?: {
        job_titles?: string[];
        seniority_levels?: string[];
        industries?: string[];
      };
      qualification_questions?: Array;
    };
    customQaRules?: string;
    customQaFields?: Array;
  }>({
    queryKey: filterCampaign ? [`/api/campaigns/${filterCampaign}`] : [],
    enabled: !!filterCampaign,
  });

  // Fetch agents for filter dropdown
  const { data: agents = [] } = useQuery>({
    queryKey: ['/api/users/agents'],
  });

  // Fetch industries for filter dropdown
  const { data: industries = [] } = useQuery>({
    queryKey: ['/api/industries'],
  });

  // Fetch available tags
  const { data: availableTags = [] } = useQuery({
    queryKey: ['/api/lead-tags'],
  });

  // Fetch deleted leads (admin only)
  const { data: deletedLeads = [], isLoading: deletedLoading } = useQuery({
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

  const [bypassQualityCheck, setBypassQualityCheck] = useState(false);

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }
      return await apiRequest('POST', `/api/leads/${id}/approve`, { 
        approvedById: user.id,
        bypassQualityCheck 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
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

      const approvedCount = Number(data?.approvedCount || 0);
      const failedCount = Number(data?.failedCount || 0);
      const summaryParts: string[] = [];
      if (approvedCount > 0) summaryParts.push(`${approvedCount} approved`);
      if (failedCount > 0) summaryParts.push(`${failedCount} failed validation`);

      toast({
        title: approvedCount > 0 ? "PM Approval Complete" : "No Leads Approved",
        description: summaryParts.length > 0
          ? summaryParts.join(' · ')
          : (data.message || "Leads approved by PM and submitted to client portal"),
        variant: approvedCount > 0 ? (failedCount > 0 ? "destructive" : "default") : "destructive",
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

  // Bulk PM Approval with quality exceptions (requires override reason)
  const bulkPmApproveWithExceptionsMutation = useMutation({
    mutationFn: async ({ leadIds, overrideReason }: { leadIds: string[]; overrideReason: string }) => {
      if (!user?.id) {
        throw new Error("User not authenticated");
      }
      return await apiRequest('POST', '/api/leads/pm-approve-bulk', {
        leadIds,
        pmApprovedById: user.id,
        allowQualityBypass: true,
        overrideReason,
      });
    },
    onSuccess: async (response) => {
      const data = await response.json();
      queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      setSelectedLeads([]);

      const approvedCount = Number(data?.approvedCount || 0);
      const overrideApprovedCount = Number(data?.overrideApprovedCount || 0);
      const failedCount = Number(data?.failedCount || 0);
      const summaryParts: string[] = [];
      if (approvedCount > 0) summaryParts.push(`${approvedCount} approved`);
      if (overrideApprovedCount > 0) summaryParts.push(`${overrideApprovedCount} via exception override`);
      if (failedCount > 0) summaryParts.push(`${failedCount} failed status validation`);

      toast({
        title: approvedCount > 0 ? "PM Exception Approval Complete" : "No Leads Approved",
        description: summaryParts.length > 0
          ? summaryParts.join(' · ')
          : (data.message || "No leads were approved"),
        variant: approvedCount > 0 ? (failedCount > 0 ? "destructive" : "default") : "destructive",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to approve leads with exceptions",
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

  const processAllUnanalyzedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/leads/process-unanalyzed', { limit: 200 });
      return await res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Processing Started",
        description: data.message || "Processing unanalyzed leads in background. Refresh in a few minutes.",
      });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/leads'], refetchType: 'active' });
      }, 30000);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Processing Failed",
        description: error.message || "Failed to start processing",
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

  const isQaApprovedStatus = (status: string | null | undefined) =>
    status === 'approved' || status === 'pending_pm_review';

  const getStatusBadge = (status: string) => {
    const config: Record = {
      new: { variant: "secondary", label: "New" },
      under_review: { variant: "default", label: "Under Review" },
      'Pending Review': { variant: "default", label: "Pending Review" },
      approved: { variant: "outline", label: "Approved" },
      pending_pm_review: { variant: "outline", label: "Approved (PM)" },
      rejected: { variant: "destructive", label: "Rejected" },
      published: { variant: "outline", label: "Published" },
    };
    const { variant, label } = config[status] || config.new;
    return {label};
  };

  const getDeliveryBadge = (lead: LeadWithAccount) => {
    if (lead.deliveredAt) {
      return (
        
          
          Delivered
        
      );
    }
    if (isQaApprovedStatus(lead.qaStatus) || lead.qaStatus === 'published') {
      return (
        
          Pending Delivery
        
      );
    }
    return null;
  };

  const getSubmissionBadge = (lead: LeadWithAccount) => {
    if (lead.submittedToClient && lead.submittedAt) {
      return (
        
          
          Submitted
        
      );
    }
    // Show "Ready to Submit" for published leads
    if (lead.qaStatus === 'published' && !lead.submittedToClient) {
      return (
        
          
          Ready to Submit
        
      );
    }
    // Show "Pending Publish" for approved leads (not yet published)
    if (isQaApprovedStatus(lead.qaStatus) && !lead.submittedToClient) {
      return (
        
          Pending Publish
        
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
    if (filterQAStatus) {
      if (filterQAStatus === 'approved') {
        if (!(isQaApprovedStatus(l.qaStatus) || l.qaStatus === 'published')) return false;
      } else if (filterQAStatus === 'pending_review' || filterQAStatus === 'in_review') {
        if (!(l.qaStatus === 'new' || l.qaStatus === 'under_review' || l.qaStatus === 'Pending Review')) return false;
      } else if (l.qaStatus !== filterQAStatus) {
        return false;
      }
    }
    if (filterDeliveryStatus === 'pending' && l.deliveredAt) return false;
    if (filterDeliveryStatus === 'submitted' && !l.deliveredAt) return false;
    if (filterIndustry && l.accountIndustry !== filterIndustry) return false;
    if (filterCompany && !l.accountName?.toLowerCase().includes(filterCompany.toLowerCase())) return false;
    // Score filter - filter by minimum AI score threshold
    if (filterMinScore) {
      const minScoreValue = parseInt(filterMinScore, 10);
      const leadScore = l.aiScore ? parseFloat(String(l.aiScore)) : 0;
      if (leadScore  l.qaStatus === 'new' || l.qaStatus === 'under_review' || l.qaStatus === 'Pending Review');
  const approvedLeads = filteredLeads.filter(l => isQaApprovedStatus(l.qaStatus) || l.qaStatus === 'published');
  const pmReviewLeads = filteredLeads.filter(l => isQaApprovedStatus(l.qaStatus));
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
        
          
            
              
                {showCheckbox && }
                Contact
                Campaign
                Agent / Caller
                Call Recording
                Tags
                AI Score
                Status
                Submitted
                {showActions && Actions}
              
            
            
              {[1, 2, 3].map((i) => (
                
                  {showCheckbox && }
                  
                  
                  
                  
                  
                  
                  
                  
                  {showActions && }
                
              ))}
            
          
        
      );
    }

    if (leadsData.length === 0) {
      return (
        
      );
    }

    return (
      
        
          
            
              {showCheckbox && (
                
                   0}
                    onCheckedChange={(checked) => {
                      setSelectedLeads(checked ? leadsData.map(l => l.id) : []);
                    }}
                    data-testid="checkbox-select-all"
                  />
                
              )}
              Contact
              Campaign
              Agent / Caller
              Call Recording
              Tags
              AI Score
              Status
              Submitted
              {showActions ? (
                Actions
              ) : (
                
              )}
            
          
          
            {leadsData.map((lead) => {
              const initials = lead.contactName?.split(' ').map((n: string) => n[0]).join('').toUpperCase() || '?';
              const agentName = getAgentDisplayName(lead);
              const agentInitials = agentName ? getAgentInitials(lead) : '?';
              
              return (
                
                  {showCheckbox && (
                    
                       toggleLead(lead.id)}
                        data-testid={`checkbox-lead-${lead.id}`}
                      />
                    
                  )}
                  
                    
                      
                        {initials}
                      
                      
                        
                          {lead.contactName || 'Unknown'}
                        
                        
                          {lead.accountName || 'No company'}
                        
                        
                          {lead.contactEmail || 'No email'}
                        
                      
                    
                  
                  
                    {(lead.campaignId && campaignNameMap.get(lead.campaignId)) || lead.campaignId || '-'}
                  
                  
                    {agentName ? (
                      
                        
                          
                            {agentInitials}
                          
                        
                        
                          
                            {agentName}
                          
                          {lead.agentEmail && (
                            
                              {lead.agentEmail}
                            
                          )}
                        
                      
                    ) : (
                      -
                    )}
                  
                  
                    {lead.recordingUrl ? (
                      
                         handlePlayRecording(lead.id, lead.recordingUrl!)}
                          disabled={loadingRecordingId === lead.id}
                          data-testid={`button-play-recording-${lead.id}`}
                          title={loadingRecordingId === lead.id ? "Loading..." : "Play in new tab"}
                        >
                          {loadingRecordingId === lead.id ? (
                            
                          ) : (
                            
                          )}
                        
                        {lead.callDuration && (
                          
                            {Math.floor(lead.callDuration / 60)}:{(lead.callDuration % 60).toString().padStart(2, '0')}
                          
                        )}
                         openLeadRecordingInNewTab(lead.id, lead.recordingUrl)}
                          data-testid={`button-download-recording-${lead.id}`}
                          title="Download recording"
                        >
                          
                        
                      
                    ) : (
                      
                         syncRecordingMutation.mutate(lead.id)}
                          disabled={syncRecordingMutation.isPending}
                          data-testid={`button-sync-recording-${lead.id}`}
                          title="Fetch call recording from Telnyx by searching dialed number"
                        >
                          {syncRecordingMutation.isPending ? (
                            
                          ) : (
                            
                          )}
                          Sync
                        
                        No recording
                      
                    )}
                  
                  
                    
                      {(lead.tags || []).map((tag: LeadTag) => (
                         removeTagMutation.mutate({ leadId: lead.id, tagId: tag.id })}
                          data-testid={`badge-tag-${lead.id}-${tag.id}`}
                          title="Click to remove tag"
                        >
                          {tag.name}
                          
                        
                      ))}
                      {!isAgentOnly && (
                        
                          
                            
                              
                            
                          
                          
                            
                              {availableTags.length === 0 ? (
                                No tags available
                              ) : (
                                availableTags
                                  .filter(tag => !(lead.tags || []).some((t: LeadTag) => t.id === tag.id))
                                  .map(tag => (
                                     addTagMutation.mutate({ leadId: lead.id, tagId: tag.id })}
                                      data-testid={`button-apply-tag-${lead.id}-${tag.id}`}
                                    >
                                      
                                      {tag.name}
                                    
                                  ))
                              )}
                               setTagDialogOpen(true)}
                                data-testid={`button-create-tag-${lead.id}`}
                              >
                                
                                Create new tag
                              
                            
                          
                        
                      )}
                    
                  
                  
                    {lead.aiScore ? (
                      = 50 ? "default" : "secondary"}
                        className={parseFloat(String(lead.aiScore)) >= 70 ? "bg-success" : parseFloat(String(lead.aiScore)) >= 50 ? "bg-warning" : ""}
                        data-testid={`badge-ai-score-${lead.id}`}
                      >
                        {parseFloat(String(lead.aiScore)).toFixed(0)}%
                      
                    ) : (
                      -
                    )}
                  
                  
                    
                      {getStatusBadge(lead.qaStatus)}
                      {getSubmissionBadge(lead)}
                      {getDeliveryBadge(lead)}
                    
                  
                  
                    {new Date(lead.createdAt).toLocaleDateString()}
                  
                  {showActions && (
                    
                      
                         navigate(`/leads/${lead.id}`)}
                          data-testid={`button-view-details-${lead.id}`}
                        >
                          
                          Details
                        
                         validateCompanyMutation.mutate(lead.id)}
                          disabled={validateCompanyMutation.isPending}
                          data-testid={`button-validate-company-${lead.id}`}
                          title="Validate company with Companies House UK"
                        >
                          {validateCompanyMutation.isPending ? (
                            
                          ) : (
                            
                          )}
                          Validate
                        
                         approveMutation.mutate(lead.id)}
                          disabled={approveMutation.isPending}
                          data-testid={`button-approve-${lead.id}`}
                        >
                          
                          Approve
                        
                         handleReject(lead.id)}
                          disabled={rejectMutation.isPending}
                          data-testid={`button-reject-${lead.id}`}
                        >
                          
                          Reject
                        
                      
                    
                  )}
                  {!showActions && (
                    
                      
                         navigate(`/leads/${lead.id}`)}
                          data-testid={`button-view-details-${lead.id}`}
                        >
                          
                          Details
                        
                        {/* Publish button - for approved leads that aren't published yet */}
                        {isQaApprovedStatus(lead.qaStatus) && (
                           publishMutation.mutate(lead.id)}
                            disabled={publishMutation.isPending}
                            data-testid={`button-publish-${lead.id}`}
                          >
                            
                            Publish
                          
                        )}
                        {/* Submit to Client - for published leads only */}
                        {lead.qaStatus === 'published' && !lead.submittedToClient && (
                           handleSubmitToClient(lead.id)}
                            data-testid={`button-submit-to-client-${lead.id}`}
                          >
                            
                            Submit to Client
                          
                        )}
                        {/* Push to Client Dashboard - for approved/published leads not yet on dashboard */}
                        {(isQaApprovedStatus(lead.qaStatus) || lead.qaStatus === 'published') && !lead.submittedToClient && (
                           pushToDashboardMutation.mutate({ leadIds: [lead.id], autoPublish: true })}
                            disabled={pushToDashboardMutation.isPending}
                            data-testid={`button-push-dashboard-${lead.id}`}
                          >
                            
                            Push to Dashboard
                          
                        )}
                        {(lead.qaStatus === 'approved' || lead.qaStatus === 'published') && !lead.deliveredAt && (
                           handleMarkDelivered(lead.id)}
                            data-testid={`button-mark-delivered-${lead.id}`}
                          >
                            
                            Mark Delivered
                          
                        )}
                        {!isAgentOnly && (isQaApprovedStatus(lead.qaStatus) || lead.qaStatus === 'published') && (
                           handleReject(lead.id)}
                            disabled={rejectMutation.isPending}
                            data-testid={`button-reject-approved-${lead.id}`}
                          >
                            
                            Reject
                          
                        )}
                        {!isAgentOnly && lead.qaStatus === 'rejected' && (
                           approveMutation.mutate(lead.id)}
                            disabled={approveMutation.isPending}
                            data-testid={`button-approve-rejected-${lead.id}`}
                          >
                            
                            Approve
                          
                        )}
                        {userRoles.includes('admin') && (
                           {
                              setDeletingLeadId(lead.id);
                              setDeleteDialogOpen(true);
                            }}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-${lead.id}`}
                            className="text-destructive hover:text-destructive"
                          >
                            
                          
                        )}
                      
                    
                  )}
                
              );
            })}
          
        
      
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

  const openLeadRecordingInNewTab = async (leadId: string, fallbackUrl?: string | null) => {
    setLoadingRecordingId(leadId);
    try {
      const res = await apiRequest('GET', `/api/leads/${leadId}/recording-url`);
      if (!res.ok) throw new Error('Failed to get recording URL');
      const data = await res.json();
      if (data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else if (fallbackUrl) {
        window.open(fallbackUrl, '_blank', 'noopener,noreferrer');
      } else {
        toast({
          title: "No Recording",
          description: "No recording URL available for this lead.",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error('Failed to get recording URL:', error);
      toast({
        title: "Recording Error",
        description: error.message || "Failed to get recording URL. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoadingRecordingId(null);
    }
  };

  const handlePlayRecording = async (leadId: string, recordingUrl?: string | null) => {
    await openLeadRecordingInNewTab(leadId, recordingUrl);
  };

  const isPlayingRecording = (_leadId: string) => {
    return false; // No inline playback anymore
  };

  return (
    
      
        
          Leads & QA
          
            Review, approve, and manage qualified leads
          
        
        
          {canExportData && (
            
              {exportLoading ? (
                
              ) : (
                
              )}
              Download Approved
            
          )}
          {canExportData && (
            
              {exportLoading ? (
                
              ) : (
                
              )}
              Export Filtered
            
          )}
        
      

      {/* Comprehensive Filtering Controls */}
      
        
          {/* Search */}
          
            Search
             setSearchQuery(e.target.value)}
              data-testid="input-filter-search"
            />
          

          {/* Agent Filter */}
          
            Agent
             setFilterAgent(val === "all" ? "" : val)}>
              
                
              
              
                All agents
                {agents.map((agent) => (
                  
                    {agent.firstName} {agent.lastName}
                  
                ))}
              
            
          

          {/* Campaign Filter */}
          
            Campaign
             setFilterCampaign(val === "all" ? "" : val)}>
              
                
              
              
                All campaigns
                {campaigns.map((campaign) => (
                  
                    {campaign.name}
                  
                ))}
              
            
          

          {/* QA Status Filter */}
          
            QA Status
             setFilterQAStatus(val === "all" ? "" : val)}>
              
                
              
              
                All statuses
                New
                Under Review
                Approved
                Approved (PM Review)
                Rejected
                Published
              
            
          

          {/* Delivery Status Filter */}
          
            Delivery Status
             setFilterDeliveryStatus(val === "all" ? "" : val)}>
              
                
              
              
                All deliveries
                Pending
                Submitted
              
            
          

          {/* AI Score Filter */}
          
            AI Score
             setFilterMinScore(val === "all" ? "" : val)}>
              
                
              
              
                All scores
                50%+ (Medium+)
                60%+ (Good)
                70%+ (Strong)
                80%+ (Excellent)
                90%+ (Outstanding)
              
            
          

          {/* Industry Filter */}
          
            Industry
             setFilterIndustry(val === "all" ? "" : val)}>
              
                
              
              
                All industries
                {industries.map((industry) => (
                  
                    {industry.name}
                  
                ))}
              
            
          

          {/* Company Filter */}
          
            Company
             setFilterCompany(e.target.value)}
              data-testid="input-filter-company"
            />
          

          {/* Date From Filter */}
          
            Date From
             setFilterDateFrom(e.target.value)}
              data-testid="input-filter-date-from"
            />
          

          {/* Date To Filter */}
          
            Date To
             setFilterDateTo(e.target.value)}
              data-testid="input-filter-date-to"
            />
          
        

        {/* Active Filters Display & Clear Button */}
        {activeFilters.length > 0 && (
          
            Active filters:
            
              {activeFilters.map((filter) => (
                
                  {filter}
                
              ))}
            
            
              
              Clear All
            
          
        )}
      

      {/* Campaign QA Parameters - Collapsible (shown when campaign is selected) */}
      {filterCampaign && selectedCampaignDetails && (selectedCampaignDetails.qaParameters || selectedCampaignDetails.customQaRules) && (
        
          
            
              
                
                Campaign QA Parameters
                {selectedCampaignDetails.name}
              
              {showQAParameters ?  : }
            
          
          
            
              
                {/* Min Score */}
                {selectedCampaignDetails.qaParameters?.min_score && (
                  
                    Min Score
                    
                      {selectedCampaignDetails.qaParameters.min_score}%
                    
                  
                )}

                {/* Target Job Titles */}
                {(selectedCampaignDetails.qaParameters?.client_criteria?.job_titles || []).length > 0 && (
                  
                    Target Job Titles
                    
                      {selectedCampaignDetails.qaParameters?.client_criteria?.job_titles?.map((title, i) => (
                        {title}
                      ))}
                    
                  
                )}

                {/* Target Seniority */}
                {(selectedCampaignDetails.qaParameters?.client_criteria?.seniority_levels || []).length > 0 && (
                  
                    Target Seniority
                    
                      {selectedCampaignDetails.qaParameters?.client_criteria?.seniority_levels?.map((level, i) => (
                        {level}
                      ))}
                    
                  
                )}

                {/* Target Industries */}
                {(selectedCampaignDetails.qaParameters?.client_criteria?.industries || []).length > 0 && (
                  
                    Target Industries
                    
                      {selectedCampaignDetails.qaParameters?.client_criteria?.industries?.map((industry, i) => (
                        {industry}
                      ))}
                    
                  
                )}

                {/* Custom QA Fields */}
                {selectedCampaignDetails.customQaFields && selectedCampaignDetails.customQaFields.length > 0 && (
                  
                    Custom Fields to Extract
                    
                      {selectedCampaignDetails.customQaFields.map((field, i) => (
                        
                          {field.label} ({field.type}){field.required && ' *'}
                        
                      ))}
                    
                  
                )}
              

              {/* Custom QA Rules */}
              {selectedCampaignDetails.customQaRules && (
                
                  
                    
                    AI Qualification Rules
                  
                  
                    {selectedCampaignDetails.customQaRules}
                  
                
              )}
            
          
        
      )}

      
        {/* Only show tab list when not accessed via PM Review direct link */}
        {tabFromUrl !== 'pm-review' && (
          
            
              
              Pending Review ({pendingLeads.length})
            
            
              
              Approved ({approvedLeads.length})
            
            
              
              Rejected ({rejectedLeads.length})
            
            {userRoles.includes('admin') && (
              
                
                Deleted ({deletedLeads.length})
              
            )}
          
        )}

        
          
            
              
                
                 setSearchQuery(e.target.value)}
                  data-testid="input-search-leads"
                />
              
              
            
            
              {!isAgentOnly && selectedLeads.length > 0 && (
                <>
                  
                    
                      
                        {bulkTagMutation.isPending ? (
                          
                        ) : (
                          
                        )}
                        Tag ({selectedLeads.length})
                      
                    
                    
                      {availableTags.length === 0 ? (
                        No tags available
                      ) : (
                        availableTags.map(tag => (
                           bulkTagMutation.mutate({ leadIds: selectedLeads, tagId: tag.id })}
                            data-testid={`menu-bulk-tag-${tag.id}`}
                          >
                            
                            {tag.name}
                          
                        ))
                      )}
                      
                       setTagDialogOpen(true)}>
                        
                        Create new tag
                      
                    
                  
                  
                    {approveMutation.isPending ? (
                      
                    ) : (
                      
                    )}
                    Approve ({selectedLeads.length})
                  
                   setBulkUpdateDialogOpen(true)}
                    data-testid="button-bulk-update"
                  >
                    
                    Update ({selectedLeads.length})
                  
                  {canExportData && (
                     bulkExportMutation.mutate(selectedLeads)}
                      disabled={bulkExportMutation.isPending}
                      data-testid="button-bulk-export"
                    >
                      {bulkExportMutation.isPending ? (
                        
                      ) : (
                        
                      )}
                      Export ({selectedLeads.length})
                    
                  )}
                  {userRoles.includes('admin') && (
                     setBulkDeleteDialogOpen(true)}
                      data-testid="button-bulk-delete"
                    >
                      
                      Delete ({selectedLeads.length})
                    
                  )}
                
              )}
            
          

          {!isAgentOnly && campaigns.length > 0 && (
            
              
              
                Automated Lead Processing & Validation
                
                  Select a campaign to run all validation steps: AI QA Re-evaluation, Companies House validation, Recording sync, and Auto-approval
                
              
              
                
                  
                    
                  
                  
                    {campaigns.map((campaign) => (
                      
                        {campaign.name}
                      
                    ))}
                  
                
                
                  {consolidatedProcessMutation.isPending ? (
                    <>
                      
                      Processing...
                    
                  ) : (
                    <>
                      
                      Process All
                    
                  )}
                
                
                  {reEvaluateQAMutation.isPending ? (
                    <>
                      
                      Re-evaluating...
                    
                  ) : (
                    <>
                      
                      Re-evaluate Only
                    
                  )}
                
                 processAllUnanalyzedMutation.mutate()}
                  disabled={processAllUnanalyzedMutation.isPending}
                  data-testid="button-score-all-unanalyzed"
                >
                  {processAllUnanalyzedMutation.isPending ? (
                    <>
                      
                      Scoring...
                    
                  ) : (
                    <>
                      
                      Score All Unanalyzed
                    
                  )}
                
              
            
          )}

          {isAgentOnly && (
            
              
              
                View-Only Access
                
                  You can view your leads here, but cannot approve or reject them. Contact a quality analyst or admin if you need to make changes.
                
              
            
          )}

          {renderLeadsTable(pendingLeads, !isAgentOnly, !isAgentOnly)}
        

        
          {!isAgentOnly && selectedLeads.length > 0 && (
            
              
                
                  
                    {bulkTagMutation.isPending ? (
                      
                    ) : (
                      
                    )}
                    Tag ({selectedLeads.length})
                  
                
                
                  {availableTags.length === 0 ? (
                    No tags available
                  ) : (
                    availableTags.map(tag => (
                       bulkTagMutation.mutate({ leadIds: selectedLeads, tagId: tag.id })}
                        data-testid={`menu-bulk-tag-approved-${tag.id}`}
                      >
                        
                        {tag.name}
                      
                    ))
                  )}
                  
                   setTagDialogOpen(true)}>
                    
                    Create new tag
                  
                
              
              
                {submitToClientBulkMutation.isPending ? (
                  
                ) : (
                  
                )}
                Submit to Client ({selectedLeads.length})
              
              
                {pushToDashboardMutation.isPending ? (
                  
                ) : (
                  
                )}
                Push to Client Dashboard ({selectedLeads.length})
              
              
                {markDeliveredBulkMutation.isPending ? (
                  
                ) : (
                  
                )}
                Mark as Delivered ({selectedLeads.length})
              
               setBulkUpdateDialogOpen(true)}
                data-testid="button-bulk-update-approved"
              >
                
                Update ({selectedLeads.length})
              
              {canExportData && (
                 bulkExportMutation.mutate(selectedLeads)}
                  disabled={bulkExportMutation.isPending}
                  data-testid="button-bulk-export-approved"
                >
                  {bulkExportMutation.isPending ? (
                    
                  ) : (
                    
                  )}
                  Export ({selectedLeads.length})
                
              )}
              {userRoles.includes('admin') && (
                 setBulkDeleteDialogOpen(true)}
                  data-testid="button-bulk-delete-approved"
                >
                  
                  Delete ({selectedLeads.length})
                
              )}
            
          )}
          {/* Campaign-level Push to Dashboard - shown when campaign is filtered */}
          {!isAgentOnly && filterCampaign && selectedLeads.length === 0 && (
            
              
                
                  
                  
                    Push all qualified leads for this campaign to the client dashboard
                  
                
                
                  {pushToDashboardMutation.isPending ? (
                    
                  ) : (
                    
                  )}
                  Push All to Client Dashboard
                
              
            
          )}
          {renderLeadsTable(approvedLeads, !isAgentOnly, false)}
        

        {/* PM Review Tab - Project Management final approval before client portal */}
        {(userRoles.includes('admin') || userRoles.includes('campaign_manager')) && (
          
            
              
                
                  
                  Project Management Review
                
              
              
                
                  These leads have been approved by QA and are awaiting final PM review before publishing to the client portal.
                  Approve to submit to client or reject to return to QA team.
                
              
            
            
            {selectedLeads.length > 0 && (
              
                 bulkPmApproveMutation.mutate(selectedLeads)}
                  disabled={bulkPmApproveMutation.isPending}
                  variant="default"
                  data-testid="button-bulk-pm-approve"
                >
                  {bulkPmApproveMutation.isPending ? (
                    
                  ) : (
                    
                  )}
                  PM Approve & Publish ({selectedLeads.length})
                
                   {
                      const reason = window.prompt(
                        'Enter required reason for PM exception override (quality checks will be bypassed):'
                      );
                      if (!reason || !reason.trim()) {
                        toast({
                          title: "Override reason required",
                          description: "Please provide a reason to approve with exceptions.",
                          variant: "destructive",
                        });
                        return;
                      }
                      bulkPmApproveWithExceptionsMutation.mutate({
                        leadIds: selectedLeads,
                        overrideReason: reason.trim(),
                      });
                    }}
                    disabled={bulkPmApproveWithExceptionsMutation.isPending}
                    data-testid="button-bulk-pm-approve-with-exceptions"
                  >
                    {bulkPmApproveWithExceptionsMutation.isPending ? (
                      
                    ) : (
                      
                    )}
                    Approve with Exceptions ({selectedLeads.length})
                  
                {canExportData && (
                   bulkExportMutation.mutate(selectedLeads)}
                    disabled={bulkExportMutation.isPending}
                    data-testid="button-bulk-export-pm-review"
                  >
                    {bulkExportMutation.isPending ? (
                      
                    ) : (
                      
                    )}
                    Export ({selectedLeads.length})
                  
                )}
              
            )}
            
            {/* PM Review Table */}
            
              
                
                  
                    
                       0 && selectedLeads.length === pmReviewLeads.length}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedLeads(pmReviewLeads.map(l => l.id));
                          } else {
                            setSelectedLeads([]);
                          }
                        }}
                        aria-label="Select all PM review leads"
                      />
                    
                    Contact
                    Company
                    Campaign
                    QA Status
                    QA Approved By
                    Recording
                    Actions
                  
                
                
                  {pmReviewLeads.length === 0 ? (
                    
                      
                        No leads pending PM review
                      
                    
                  ) : (
                    pmReviewLeads.map((lead) => (
                      
                        
                           {
                              if (checked) {
                                setSelectedLeads([...selectedLeads, lead.id]);
                              } else {
                                setSelectedLeads(selectedLeads.filter(id => id !== lead.id));
                              }
                            }}
                            aria-label={`Select ${lead.firstName} ${lead.lastName}`}
                          />
                        
                        
                           navigate(`/leads/${lead.id}`)}
                          >
                            
                              
                                {(lead.firstName?.[0] || '') + (lead.lastName?.[0] || '')}
                              
                            
                            
                              {lead.firstName} {lead.lastName}
                              {lead.title}
                            
                          
                        
                        
                          
                            
                            {lead.accountName || '-'}
                          
                        
                        {lead.campaignName || '-'}
                        
                          
                            {lead.qaStatus === 'approved'
                              ? 'QA Approved'
                              : lead.qaStatus === 'pending_pm_review'
                                ? 'QA Approved (Awaiting PM)'
                                : 'Pending PM'}
                          
                        
                        
                          
                            {lead.approvedAt ? (
                              <>
                                {new Date(lead.approvedAt).toLocaleDateString()}
                                by QA Team
                              
                            ) : '-'}
                          
                        
                        
                          {lead.recordingUrl ? (
                             handlePlayRecording(lead.id, lead.recordingUrl)}
                              disabled={loadingRecordingId === lead.id}
                              data-testid={`button-pm-play-recording-${lead.id}`}
                            >
                              {loadingRecordingId === lead.id ? (
                                
                              ) : (
                                <>
                                  
                                  Play
                                
                              )}
                            
                          ) : (
                            No recording
                          )}
                        
                        
                          
                             pmApproveMutation.mutate(lead.id)}
                              disabled={pmApproveMutation.isPending}
                              data-testid={`button-pm-approve-${lead.id}`}
                            >
                              {pmApproveMutation.isPending ? (
                                
                              ) : (
                                <>
                                  
                                  Approve
                                
                              )}
                            
                             {
                                setPmRejectingLeadId(lead.id);
                                setPmRejectDialogOpen(true);
                              }}
                              data-testid={`button-pm-reject-${lead.id}`}
                            >
                              
                              Return to QA
                            
                             navigate(`/leads/${lead.id}`)}
                              data-testid={`button-view-${lead.id}`}
                            >
                              
                            
                          
                        
                      
                    ))
                  )}
                
              
            
          
        )}

        
          {!isAgentOnly && selectedLeads.length > 0 && (
            
              
                
                  
                    {bulkTagMutation.isPending ? (
                      
                    ) : (
                      
                    )}
                    Tag ({selectedLeads.length})
                  
                
                
                  {availableTags.length === 0 ? (
                    No tags available
                  ) : (
                    availableTags.map(tag => (
                       bulkTagMutation.mutate({ leadIds: selectedLeads, tagId: tag.id })}
                        data-testid={`menu-bulk-tag-rejected-${tag.id}`}
                      >
                        
                        {tag.name}
                      
                    ))
                  )}
                  
                   setTagDialogOpen(true)}>
                    
                    Create new tag
                  
                
              
               setBulkUpdateDialogOpen(true)}
                data-testid="button-bulk-update-rejected"
              >
                
                Update ({selectedLeads.length})
              
              {canExportData && (
                 bulkExportMutation.mutate(selectedLeads)}
                  disabled={bulkExportMutation.isPending}
                  data-testid="button-bulk-export-rejected"
                >
                  {bulkExportMutation.isPending ? (
                    
                  ) : (
                    
                  )}
                  Export ({selectedLeads.length})
                
              )}
              {userRoles.includes('admin') && (
                 setBulkDeleteDialogOpen(true)}
                  data-testid="button-bulk-delete-rejected"
                >
                  
                  Delete ({selectedLeads.length})
                
              )}
            
          )}
          {renderLeadsTable(rejectedLeads, !isAgentOnly, false)}
        

        {/* Deleted Leads Tab - Admin Only */}
        {userRoles.includes('admin') && (
          
            {selectedLeads.length > 0 && (
              
                 bulkRestoreMutation.mutate(selectedLeads)}
                  disabled={bulkRestoreMutation.isPending}
                  variant="default"
                  data-testid="button-bulk-restore"
                >
                  {bulkRestoreMutation.isPending ? (
                    
                  ) : (
                    
                  )}
                  Restore ({selectedLeads.length})
                
              
            )}
            
            {deletedLoading ? (
              
                {[1, 2, 3].map(i => (
                  
                ))}
              
            ) : deletedLeads.length === 0 ? (
              
            ) : (
              
                
                  
                    
                      
                         0 && selectedLeads.length === deletedLeads.length}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedLeads(deletedLeads.map(l => l.id));
                            } else {
                              setSelectedLeads([]);
                            }
                          }}
                          data-testid="checkbox-select-all-deleted"
                        />
                      
                      Contact
                      Company
                      Previous Status
                      Deleted
                      Actions
                    
                  
                  
                    {deletedLeads.map((lead) => (
                      
                        
                           {
                              if (checked) {
                                setSelectedLeads([...selectedLeads, lead.id]);
                              } else {
                                setSelectedLeads(selectedLeads.filter(id => id !== lead.id));
                              }
                            }}
                            data-testid={`checkbox-deleted-lead-${lead.id}`}
                          />
                        
                        
                          
                            
                              
                                {lead.contactName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || '??'}
                              
                            
                            
                              {lead.contactName || 'Unknown'}
                              {lead.contactEmail || 'No email'}
                            
                          
                        
                        
                          
                            
                            {lead.accountName || 'Unknown'}
                          
                        
                        
                          
                            {lead.qaStatus}
                          
                        
                        
                          
                            {(lead as any).deletedAt ? new Date((lead as any).deletedAt).toLocaleDateString() : 'Unknown'}
                            {(lead as any).deleterFirstName && (
                              
                                by {(lead as any).deleterFirstName} {(lead as any).deleterLastName}
                              
                            )}
                          
                        
                        
                           restoreLeadMutation.mutate(lead.id)}
                            disabled={restoreLeadMutation.isPending}
                            data-testid={`button-restore-lead-${lead.id}`}
                          >
                            {restoreLeadMutation.isPending ? (
                              
                            ) : (
                              <>
                                
                                Restore
                              
                            )}
                          
                        
                      
                    ))}
                  
                
              
            )}
          
        )}
      

      {/* Lead Detail Dialog */}
      
        
          
            
              
              Lead Details: {selectedLead?.contactName}
            
            
              Review complete lead information, QA checklist, and AI analysis
            
          

          {selectedLead && (
            
              {/* Contact & Account Info */}
              
                
                  
                    Contact Information
                  
                  
                    
                      Name:{' '}
                      {selectedLead.contactName}
                    
                    {selectedLead.contactTitle && (
                      
                        Job Title:{' '}
                        {selectedLead.contactTitle}
                      
                    )}
                    
                      Email:{' '}
                      {selectedLead.contactEmail}
                    
                    {selectedLead.dialedNumber && (
                      
                        Phone Called:{' '}
                        {selectedLead.dialedNumber}
                      
                    )}
                    {(selectedLead.contactCity || selectedLead.contactState || selectedLead.contactCountry) && (
                      
                        Location:{' '}
                        
                          {[selectedLead.contactCity, selectedLead.contactState, selectedLead.contactCountry].filter(Boolean).join(', ')}
                        
                      
                    )}
                    {selectedLead.contactLinkedin && (
                      
                        LinkedIn:{' '}
                        
                          Profile
                        
                      
                    )}
                  
                
                
                  
                    Account Information
                  
                  
                    
                      Account Name:{' '}
                      {selectedLead.accountName || '-'}
                    
                    {(selectedLead.accountCity || selectedLead.accountState || selectedLead.accountCountry) && (
                      
                        Location:{' '}
                        
                          {[selectedLead.accountCity, selectedLead.accountState, selectedLead.accountCountry].filter(Boolean).join(', ')}
                        
                      
                    )}
                    {selectedLead.accountRevenueRange && (
                      
                        Revenue Range:{' '}
                        {selectedLead.accountRevenueRange}
                      
                    )}
                    {selectedLead.accountEmployeesRange && (
                      
                        Employee Size:{' '}
                        {selectedLead.accountEmployeesRange}
                      
                    )}
                    {selectedLead.accountIndustry && (
                      
                        Industry:{' '}
                        {selectedLead.accountIndustry}
                      
                    )}
                    {selectedLead.accountLinkedin && (
                      
                        LinkedIn:{' '}
                        
                          Company Page
                        
                      
                    )}
                  
                
              

              {/* Agent / Caller Info */}
              {(() => {
                              const agentName = getAgentDisplayName(selectedLead);
                              if (!agentName) return null;
                              const initials = getAgentInitials(selectedLead);
                              return (
                                
                                  
                                    
                                      {initials}
                                    
                                  
                                  
                                    {agentName}
                                    {selectedLead.agentEmail && (
                                      {selectedLead.agentEmail}
                                    )}
                                  
                                
                              );
                            })() || null
                          }

              {/* Agent / Caller Info */}
              
                
                  Agent / Caller
                
                
                  {selectedLead.agentFirstName || selectedLead.agentLastName ? (
                    
                      
                        
                          {`${selectedLead.agentFirstName?.[0] || ''}${selectedLead.agentLastName?.[0] || ''}`.toUpperCase()}
                        
                      
                      
                        {`${selectedLead.agentFirstName || ''} ${selectedLead.agentLastName || ''}`.trim()}
                        {selectedLead.agentEmail}
                      
                    
                  ) : (
                    No agent assigned
                  )}
                
              

              {/* Call Recording & Duration */}
              
                Call Recording
                {selectedLead.recordingUrl ? (
                  
                     openLeadRecordingInNewTab(selectedLead.id, selectedLead.recordingUrl)}
                      data-testid="button-play-recording-detail"
                    >
                      
                      Play Recording
                    
                    {selectedLead.callDuration && (
                      
                        Duration: {Math.floor(selectedLead.callDuration / 60)}:{(selectedLead.callDuration % 60).toString().padStart(2, '0')}
                      
                    )}
                  
                ) : selectedLead.callAttemptId ? (
                  
                     syncRecordingMutation.mutate(selectedLead.id)}
                      disabled={syncRecordingMutation.isPending}
                      data-testid="button-fetch-recording-dialog"
                    >
                      
                      Fetch Recording
                    
                    
                      Recording not yet available
                    
                  
                ) : (
                  No recording available for this lead
                )}
              

              {/* AI Analysis */}
              {(selectedLead.aiScore || selectedLead.aiQualificationStatus) && (
                
                  AI Analysis
                  
                    {selectedLead.aiScore && (
                      
                        AI Score:
                        {selectedLead.aiScore}/100
                      
                    )}
                    {selectedLead.aiQualificationStatus && (
                      
                        AI Status:
                        {selectedLead.aiQualificationStatus}
                      
                    )}
                  
                  {selectedLead.aiAnalysis && typeof selectedLead.aiAnalysis === 'object' && (
                    
                      {JSON.stringify(selectedLead.aiAnalysis, null, 2)}
                    
                  )}
                
              )}

              {/* Transcript */}
              {selectedLead.transcript && (
                
                  Call Transcript
                  
                    {selectedLead.transcript}
                  
                
              )}

              {/* QA Checklist */}
              {selectedLead.checklistJson && typeof selectedLead.checklistJson === 'object' && (
                
                  QA Checklist
                  
                    {Object.entries(selectedLead.checklistJson as Record).map(([key, value]) => (
                      
                        
                        {key}
                      
                    ))}
                  
                
              )}

              {/* Notes */}
              {selectedLead.notes && (
                
                  Agent Notes
                  
                    {selectedLead.notes}
                  
                
              )}

              {/* Actions */}
              
                 setDetailDialogOpen(false)}
                  data-testid="button-close-detail"
                >
                  Close
                
                {selectedLead.qaStatus === 'new' && (
                  <>
                     {
                        handleReject(selectedLead.id);
                        setDetailDialogOpen(false);
                      }}
                      data-testid="button-reject-from-detail"
                    >
                      
                      Reject
                    
                     {
                        approveMutation.mutate(selectedLead.id);
                        setDetailDialogOpen(false);
                      }}
                      disabled={approveMutation.isPending}
                      data-testid="button-approve-from-detail"
                    >
                      
                      Approve Lead
                    
                  
                )}
              
            
          )}
        
      

      {/* Reject Dialog */}
      
        
          
            Reject Lead
            
              Provide a reason for rejecting this lead
            
          
           setRejectReason(e.target.value)}
            rows={4}
            data-testid="textarea-reject-reason"
          />
          
             {
                setRejectDialogOpen(false);
                setRejectReason("");
                setRejectingLeadId(null);
              }}
              data-testid="button-cancel-reject"
            >
              Cancel
            
             {
                if (rejectingLeadId && rejectReason.trim()) {
                  rejectMutation.mutate({ id: rejectingLeadId, reason: rejectReason });
                }
              }}
              disabled={!rejectReason.trim() || rejectMutation.isPending}
              variant="destructive"
              data-testid="button-confirm-reject"
            >
              {rejectMutation.isPending && (
                
              )}
              Reject Lead
            
          
        
      

      {/* PM Reject Dialog - Return lead to QA */}
      
        
          
            Return Lead to QA
            
              This lead will be returned to the QA team for additional review.
              Provide feedback on what needs to be addressed.
            
          
           setPmRejectReason(e.target.value)}
            rows={4}
            data-testid="textarea-pm-reject-reason"
          />
          
             {
                setPmRejectDialogOpen(false);
                setPmRejectReason("");
                setPmRejectingLeadId(null);
              }}
              data-testid="button-cancel-pm-reject"
            >
              Cancel
            
             {
                if (pmRejectingLeadId && pmRejectReason.trim()) {
                  pmRejectMutation.mutate({ id: pmRejectingLeadId, reason: pmRejectReason });
                }
              }}
              disabled={!pmRejectReason.trim() || pmRejectMutation.isPending}
              variant="outline"
              data-testid="button-confirm-pm-reject"
            >
              {pmRejectMutation.isPending && (
                
              )}
              
              Return to QA
            
          
        
      

      {/* Delete Confirmation Dialog */}
      
        
          
            Delete Lead
            
              Are you sure you want to delete this lead? This action cannot be undone.
            
          
          
             {
                setDeleteDialogOpen(false);
                setDeletingLeadId(null);
              }}
              data-testid="button-cancel-delete"
            >
              Cancel
            
             {
                if (deletingLeadId) {
                  deleteMutation.mutate(deletingLeadId);
                }
              }}
              disabled={deleteMutation.isPending}
              variant="destructive"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending && (
                
              )}
              Delete Lead
            
          
        
      

      {/* Create Tag Dialog */}
      
        
          
            Create New Tag
            
              Create a colored tag to organize and categorize your leads.
            
          
          
            
              Tag Name
               setNewTagName(e.target.value)}
                placeholder="e.g., High Priority, Follow Up, Hot Lead"
                data-testid="input-tag-name"
              />
            
            
              Tag Color
              
                {['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#64748b'].map(color => (
                   setNewTagColor(color)}
                    data-testid={`button-color-${color}`}
                  />
                ))}
              
              
                Custom:
                 setNewTagColor(e.target.value)}
                  className="h-8 w-12 cursor-pointer"
                  data-testid="input-tag-color"
                />
              
            
            
              Preview:
              
                {newTagName || 'Tag Name'}
              
            
          
          
             {
                setTagDialogOpen(false);
                setNewTagName("");
                setNewTagColor("#6366f1");
              }}
              data-testid="button-cancel-tag"
            >
              Cancel
            
             {
                if (newTagName.trim()) {
                  createTagMutation.mutate({ name: newTagName.trim(), color: newTagColor });
                }
              }}
              disabled={createTagMutation.isPending || !newTagName.trim()}
              data-testid="button-create-tag-confirm"
            >
              {createTagMutation.isPending && (
                
              )}
              Create Tag
            
          
        
      

      {/* Submit to Client Dialog */}
      
        
          
            Submit Lead{selectedLeads.length > 1 && 's'} to Client
            
              {submittingLeadId 
                ? "This will automatically submit the lead to the client's UKEF landing page with validated UK company data." 
                : `This will submit ${selectedLeads.length} lead(s) to the client's UKEF landing page. Only leads with validated UK company data will be submitted.`}
            
          
          
            Required validations:
            
              UK company registration (Companies House)
              Active company status
              Legal company name
              Annual revenue data
              Contact details (name, email, phone, job title)
            
          
          
             {
                setSubmissionDialogOpen(false);
                setSubmittingLeadId(null);
              }}
              data-testid="button-cancel-submission"
            >
              Cancel
            
            
              {(submitToClientMutation.isPending || submitToClientBulkMutation.isPending) && (
                
              )}
              
              Submit to Client
            
          
        
      

      {/* Push to Client Dashboard Dialog */}
      
        
          
            Push Leads to Client Dashboard
            
              {selectedLeads.length > 0
                ? `This will push ${selectedLeads.length} selected lead(s) to the client dashboard, making them visible in the client portal.`
                : filterCampaign
                  ? "This will push all qualified leads for the selected campaign to the client dashboard."
                  : "Select leads or filter by campaign to push leads to the client dashboard."}
            
          
          
            
              What this does:
              
                Marks leads as submitted so they appear in the client portal
                Auto-creates client campaign access if needed
                Works for any campaign — no external form required
              
            
            
               setPushDashboardAutoPublish(checked === true)}
              />
              
                Auto-publish approved leads first (publish + push in one step)
              
            
          
          
             setPushDashboardDialogOpen(false)}
            >
              Cancel
            
            
              {pushToDashboardMutation.isPending && (
                
              )}
              
              Push to Client Dashboard
            
          
        
      

      {/* Mark as Delivered Dialog */}
      
        
          
            Mark Lead{selectedLeads.length > 1 && 's'} as Delivered
            
              {deliveringLeadId 
                ? "Mark this lead as delivered to client" 
                : `Mark ${selectedLeads.length} lead(s) as delivered to client`}
            
          
          
            
              Delivery Notes (Optional)
               setDeliveryNotes(e.target.value)}
                rows={3}
                data-testid="textarea-delivery-notes"
                className="mt-1"
              />
            
          
          
             {
                setDeliveryDialogOpen(false);
                setDeliveryNotes("");
                setDeliveringLeadId(null);
              }}
              data-testid="button-cancel-delivery"
            >
              Cancel
            
            
              {(markDeliveredMutation.isPending || markDeliveredBulkMutation.isPending) && (
                
              )}
              
              Mark as Delivered
            
          
        
      

      {/* Bulk Delete Dialog */}
      
        
          
            Delete {selectedLeads.length} Lead{selectedLeads.length !== 1 ? 's' : ''}
            
              Are you sure you want to delete {selectedLeads.length} lead{selectedLeads.length !== 1 ? 's' : ''}? 
              This action cannot be undone.
            
          
          
             setBulkDeleteDialogOpen(false)}
              data-testid="button-cancel-bulk-delete"
            >
              Cancel
            
             bulkDeleteMutation.mutate(selectedLeads)}
              disabled={bulkDeleteMutation.isPending}
              variant="destructive"
              data-testid="button-confirm-bulk-delete"
            >
              {bulkDeleteMutation.isPending && (
                
              )}
              
              Delete {selectedLeads.length} Lead{selectedLeads.length !== 1 ? 's' : ''}
            
          
        
      

      {/* Bulk Update Dialog */}
      
        
          
            Update {selectedLeads.length} Lead{selectedLeads.length !== 1 ? 's' : ''}
            
              Update QA status or assign agent for the selected leads.
            
          
          
            
              QA Status
               setBulkUpdateStatus(val === "none" ? "" : val)}>
                
                  
                
                
                  No change
                  New
                  Under Review
                  Approved
                  Approved (PM Review)
                  Rejected
                
              
            
            
              Assign Agent
               setBulkUpdateAgent(val === "none" ? "" : val)}>
                
                  
                
                
                  No change
                  {agents.map((agent) => (
                    
                      {agent.firstName} {agent.lastName}
                    
                  ))}
                
              
            
          
          
             {
                setBulkUpdateDialogOpen(false);
                setBulkUpdateStatus("");
                setBulkUpdateAgent("");
              }}
              data-testid="button-cancel-bulk-update"
            >
              Cancel
            
             {
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
                
              )}
              Update {selectedLeads.length} Lead{selectedLeads.length !== 1 ? 's' : ''}
            
          
        
      
    
  );
}