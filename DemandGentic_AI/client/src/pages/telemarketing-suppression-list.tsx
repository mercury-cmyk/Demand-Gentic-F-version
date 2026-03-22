import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/shared/empty-state";
import { useExportAuthority } from "@/hooks/use-export-authority";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import {
  Search,
  Download,
  Upload,
  Plus,
  Trash2,
  Copy,
  RefreshCw,
  Phone,
  Building2,
  Users,
  Globe,
  BarChart3,
  FileDown,
  Filter,
  ChevronDown,
  CheckSquare,
  Square,
  AlertCircle,
  UserCheck,
  ShieldPlus,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

interface SuppressionEntry {
  id: string;
  type: 'account' | 'contact' | 'domain' | 'phone' | 'global_dnc';
  identifier: string;
  name: string | null;
  source: string;
  reason: string | null;
  campaignId: string | null;
  campaignName: string | null;
  createdAt: string;
  addedBy: string | null;
}

interface Campaign {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface SuppressionStats {
  total: number;
  byType: Record;
  bySource: Record;
  byCampaign: Record;
  recentAdditions: number;
}

interface QualifiedLead {
  leadId: string;
  contactId: string | null;
  campaignId: string | null;
  campaignName: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  accountId: string | null;
  accountName: string | null;
  accountDomain: string | null;
  qaStatus: string | null;
  createdAt: string;
  contactName: string;
  isContactSuppressed: boolean;
  isAccountSuppressed: boolean;
}

export default function TelemarketingSuppressionListPage() {
  const { canExportData } = useExportAuthority();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("suppressions");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [selectedCampaign, setSelectedCampaign] = useState("all");
  const [selectedSource, setSelectedSource] = useState("all");
  const [selectedItems, setSelectedItems] = useState>(new Set());
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [uploadContent, setUploadContent] = useState("");
  const [uploadFileName, setUploadFileName] = useState(null);
  const [targetCampaignId, setTargetCampaignId] = useState("");
  
  // Qualified leads state
  const [selectedLeads, setSelectedLeads] = useState>(new Set());
  const [addLeadsDialogOpen, setAddLeadsDialogOpen] = useState(false);
  const [leadsTargetCampaign, setLeadsTargetCampaign] = useState("");
  const [leadsFilterCampaign, setLeadsFilterCampaign] = useState("all");
  const [suppressType, setSuppressType] = useState("contact");

  // Build query key with proper URL parameters
  const suppressionQueryKey = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedType !== 'all') params.set('type', selectedType);
    if (selectedCampaign !== 'all') params.set('campaign', selectedCampaign);
    if (selectedSource !== 'all') params.set('source', selectedSource);
    const queryString = params.toString();
    return [`/api/telemarketing/suppressions${queryString ? `?${queryString}` : ''}`];
  }, [selectedType, selectedCampaign, selectedSource]);

  const { data: suppressionData, isLoading: suppressionsLoading, refetch: refetchSuppressions } = useQuery({
    queryKey: suppressionQueryKey,
  });

  const { data: campaigns = [] } = useQuery({
    queryKey: ['/api/campaigns'],
    select: (data: any[]) => data.filter((c: any) => c.type === 'telemarketing' || c.type === 'phone' || c.type === 'call'),
  });

  // Qualified leads query - build proper URL
  const leadsQueryKey = useMemo(() => {
    if (leadsFilterCampaign !== 'all') {
      return [`/api/telemarketing/suppressions/qualified-leads?campaignId=${leadsFilterCampaign}`];
    }
    return ['/api/telemarketing/suppressions/qualified-leads'];
  }, [leadsFilterCampaign]);

  const { data: qualifiedLeadsData, isLoading: qualifiedLeadsLoading, refetch: refetchQualifiedLeads } = useQuery({
    queryKey: leadsQueryKey,
    enabled: activeTab === 'qualified-leads',
  });

  const qualifiedLeads = qualifiedLeadsData?.leads || [];

  const suppressions = suppressionData?.suppressions || [];
  const stats = suppressionData?.stats || { total: 0, byType: {}, bySource: {}, byCampaign: {}, recentAdditions: 0 };

  const filteredSuppressions = useMemo(() => {
    return suppressions.filter((s) => {
      const matchesSearch = searchQuery === "" ||
        s.identifier.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.reason?.toLowerCase().includes(searchQuery.toLowerCase());
      
      return matchesSearch;
    });
  }, [suppressions, searchQuery]);

  const uploadMutation = useMutation({
    mutationFn: async (data: { content: string; targetCampaignId?: string }) => {
      return await apiRequest('POST', '/api/telemarketing/suppressions/upload', {
        csvContent: data.content,
        targetCampaignId: data.targetCampaignId,
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Upload Complete",
        description: `Added ${data.added || 0} suppression entries.`,
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/telemarketing/suppressions');
        }
      });
      setUploadDialogOpen(false);
      setUploadContent("");
      setUploadFileName(null);
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error?.message || "Failed to process upload",
        variant: "destructive",
      });
    },
  });

  const copyToCampaignMutation = useMutation({
    mutationFn: async (data: { ids: string[]; targetCampaignId: string }) => {
      return await apiRequest('POST', '/api/telemarketing/suppressions/copy-to-campaign', data);
    },
    onSuccess: (data: any) => {
      toast({
        title: "Copy Complete",
        description: `Copied ${data.copied || 0} suppressions to campaign.`,
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/telemarketing/suppressions');
        }
      });
      setCopyDialogOpen(false);
      setSelectedItems(new Set());
      setTargetCampaignId("");
    },
    onError: (error: any) => {
      toast({
        title: "Copy Failed",
        description: error?.message || "Failed to copy suppressions",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return await apiRequest('DELETE', '/api/telemarketing/suppressions/bulk', { ids });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Deleted",
        description: `Removed ${data.deleted || 0} suppression entries.`,
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/telemarketing/suppressions');
        }
      });
      setSelectedItems(new Set());
    },
    onError: (error: any) => {
      toast({
        title: "Delete Failed",
        description: error?.message || "Failed to delete suppressions",
        variant: "destructive",
      });
    },
  });

  // Add leads to suppressions mutation
  const addFromLeadsMutation = useMutation({
    mutationFn: async (data: { leadIds: string[]; targetCampaignId: string; suppressType: string; reason?: string }) => {
      return await apiRequest('POST', '/api/telemarketing/suppressions/add-from-leads', data);
    },
    onSuccess: (data: any) => {
      toast({
        title: "Added to Suppressions",
        description: `Added ${data.added || 0} entries (${data.skipped || 0} already existed).`,
      });
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === 'string' && key.startsWith('/api/telemarketing/suppressions');
        }
      });
      setAddLeadsDialogOpen(false);
      setSelectedLeads(new Set());
      setLeadsTargetCampaign("");
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add",
        description: error?.message || "Failed to add leads to suppressions",
        variant: "destructive",
      });
    },
  });

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const params = new URLSearchParams();
      params.set('format', format);
      if (selectedType !== 'all') params.set('type', selectedType);
      if (selectedCampaign !== 'all') params.set('campaignId', selectedCampaign);
      if (selectedSource !== 'all') params.set('source', selectedSource);
      if (selectedItems.size > 0) params.set('ids', Array.from(selectedItems).join(','));

      const response = await fetch(`/api/telemarketing/suppressions/export?${params.toString()}`);
      
      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `telemarketing-suppressions-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Export Complete",
        description: `Downloaded suppression list as ${format.toUpperCase()}.`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export suppression list",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = (e: React.ChangeEvent) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({
        title: "Invalid File",
        description: "Please upload a CSV file",
        variant: "destructive",
      });
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadContent(event.target?.result as string);
      setUploadFileName(file.name);
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  const handleSelectAll = () => {
    if (selectedItems.size === filteredSuppressions.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(filteredSuppressions.map(s => s.id)));
    }
  };

  const handleSelectItem = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'account': return ;
      case 'contact': return ;
      case 'domain': return ;
      case 'phone':
      case 'global_dnc': return ;
      default: return ;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'account': return 'Account';
      case 'contact': return 'Contact';
      case 'domain': return 'Domain';
      case 'phone': return 'Phone';
      case 'global_dnc': return 'Global DNC';
      default: return type;
    }
  };

  const getSourceBadgeVariant = (source: string): "default" | "secondary" | "destructive" | "outline" => {
    if (source.includes('disposition') || source.includes('DNC')) return 'destructive';
    if (source.includes('upload') || source.includes('CSV')) return 'secondary';
    if (source.includes('manual')) return 'outline';
    return 'default';
  };

  // Lead selection handlers
  const handleSelectAllLeads = () => {
    if (selectedLeads.size === qualifiedLeads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(qualifiedLeads.map(l => l.leadId)));
    }
  };

  const handleSelectLead = (leadId: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeads(newSelected);
  };

  return (
    
      
        
          
            Telemarketing Suppression List
          
          
            Manage all suppression lists for telemarketing campaigns - uploaded, disposition-based, and global DNC
          
        
        
           refetchSuppressions()}
            data-testid="button-refresh-suppressions"
          >
            
            Refresh
          
          {canExportData && (
            
              
                
                  
                  Export
                  
                
              
              
                 handleExport('csv')} data-testid="menu-item-export-csv">
                  
                  Export as CSV
                
                 handleExport('json')} data-testid="menu-item-export-json">
                  
                  Export as JSON
                
              
            
          )}
           setUploadDialogOpen(true)} data-testid="button-upload-suppressions">
            
            Upload
          
        
      

      
        
          
            
            Suppressions
          
          
            
            Qualified Leads
          
        

        
          
            
          
            Total Suppressions
            
          
          
            
              {suppressionsLoading ?  : stats.total.toLocaleString()}
            
            
              Across all campaigns and sources
            
          
        

        
          
            Global DNC
            
          
          
            
              {suppressionsLoading ?  : (stats.byType['global_dnc'] || 0).toLocaleString()}
            
            
              From call dispositions
            
          
        

        
          
            Uploaded
            
          
          
            
              {suppressionsLoading ?  : (stats.bySource['upload'] || stats.bySource['CSV upload'] || 0).toLocaleString()}
            
            
              From file uploads
            
          
        

        
          
            Recent (7 days)
            
          
          
            
              {suppressionsLoading ?  : stats.recentAdditions.toLocaleString()}
            
            
              New additions this week
            
          
        
      

      
        
          
            
              Suppression Entries
              
                View, filter, and manage all suppression entries
              
            
            {selectedItems.size > 0 && (
              
                 setCopyDialogOpen(true)}
                  data-testid="button-copy-to-campaign"
                >
                  
                  Copy to Campaign ({selectedItems.size})
                
                 deleteMutation.mutate(Array.from(selectedItems))}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete-selected"
                >
                  
                  Delete ({selectedItems.size})
                
              
            )}
          
        
        
          
            
              
               setSearchQuery(e.target.value)}
                data-testid="input-search-suppressions"
              />
            
            
              
                
                
              
              
                All Types
                Accounts
                Contacts
                Domains
                Phone Numbers
                Global DNC
              
            
            
              
                
              
              
                All Sources
                Uploaded
                Qualified
                DNC
              
            
            
              
                
              
              
                All Campaigns
                Global (No Campaign)
                {campaigns.map((campaign) => (
                  
                    {campaign.name}
                  
                ))}
              
            
             0 ? "secondary" : "outline"}
              onClick={handleSelectAll}
              disabled={filteredSuppressions.length === 0}
              data-testid="button-select-all-filtered"
            >
              
              {selectedItems.size === filteredSuppressions.length && filteredSuppressions.length > 0 
                ? `Deselect All (${filteredSuppressions.length})` 
                : `Select All (${filteredSuppressions.length})`}
            
          

          {suppressionsLoading ? (
            
              
              
              
              
              
            
          ) : filteredSuppressions.length > 0 ? (
            
              
                
                  
                    
                      
                        {selectedItems.size === filteredSuppressions.length && filteredSuppressions.length > 0 ? (
                          
                        ) : (
                          
                        )}
                      
                    
                    Type
                    Identifier
                    Name
                    Source
                    Reason
                    Campaign
                    Date Added
                    Actions
                  
                
                
                  {filteredSuppressions.map((suppression) => (
                    
                      
                         handleSelectItem(suppression.id)}
                          data-testid={`checkbox-select-${suppression.id}`}
                        />
                      
                      
                        
                          {getTypeIcon(suppression.type)}
                          {getTypeLabel(suppression.type)}
                        
                      
                      
                        {suppression.identifier}
                      
                      
                        {suppression.name || '-'}
                      
                      
                        
                          {suppression.source}
                        
                      
                      
                        {suppression.reason || '-'}
                      
                      
                        {suppression.campaignName || (suppression.campaignId ? suppression.campaignId : 'Global')}
                      
                      
                        {format(new Date(suppression.createdAt), 'MMM d, yyyy')}
                      
                      
                         deleteMutation.mutate([suppression.id])}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${suppression.id}`}
                        >
                          
                        
                      
                    
                  ))}
                
              
            
          ) : (
             setUploadDialogOpen(true)}
            />
          )}
        
      
        

        
          
            
              
                
                  Qualified Leads
                  
                    View successfully qualified leads and add them to suppression lists to prevent re-calling
                  
                
                
                   refetchQualifiedLeads()}
                    data-testid="button-refresh-leads"
                  >
                    
                    Refresh
                  
                  {selectedLeads.size > 0 && (
                     setAddLeadsDialogOpen(true)}
                      data-testid="button-add-to-suppressions"
                    >
                      
                      Add to Suppressions ({selectedLeads.size})
                    
                  )}
                
              
            
            
              
                
                  
                    
                    
                  
                  
                    All Campaigns
                    {campaigns.map((campaign) => (
                      
                        {campaign.name}
                      
                    ))}
                  
                
              

              {qualifiedLeadsLoading ? (
                
                  
                  
                  
                
              ) : qualifiedLeads.length > 0 ? (
                
                  
                    
                      
                        
                          
                            {selectedLeads.size === qualifiedLeads.length && qualifiedLeads.length > 0 ? (
                              
                            ) : (
                              
                            )}
                          
                        
                        Contact
                        Account
                        Phone
                        Campaign
                        QA Status
                        Date
                        Status
                      
                    
                    
                      {qualifiedLeads.map((lead) => (
                        
                          
                             handleSelectLead(lead.leadId)}
                              data-testid={`checkbox-lead-${lead.leadId}`}
                            />
                          
                          
                            
                              
                                {lead.contactName}
                              
                              {lead.contactEmail && (
                                
                                  {lead.contactEmail}
                                
                              )}
                            
                          
                          
                            {lead.accountName || '-'}
                          
                          
                            {lead.contactPhone || '-'}
                          
                          
                            {lead.campaignName || '-'}
                          
                          
                            
                              {lead.qaStatus || 'Qualified'}
                            
                          
                          
                            {format(new Date(lead.createdAt), 'MMM d, yyyy')}
                          
                          
                            {(lead.isContactSuppressed || lead.isAccountSuppressed) ? (
                              
                                
                                Suppressed
                              
                            ) : (
                              Not suppressed
                            )}
                          
                        
                      ))}
                    
                  
                
              ) : (
                
              )}
            
          
        
      

      
        
          
            Upload Suppression List
            
              Upload a CSV file with phone numbers, emails, domains, or company names to add to the suppression list.
            
          
          
            
              
                Target Campaign (Optional)
              
              
                
                  
                
                
                  Global (applies to all campaigns)
                  {campaigns.map((campaign) => (
                    
                      {campaign.name}
                    
                  ))}
                
              
            
            
              
                CSV File or Paste Data
              
              
                
                
                  
                  
                    {uploadFileName || "Click to upload or drag and drop CSV file"}
                  
                
              
            
            
              
                Or paste data directly
              
               setUploadContent(e.target.value)}
                rows={6}
                data-testid="textarea-paste-data"
              />
            
          
          
             setUploadDialogOpen(false)} data-testid="button-cancel-upload">
              Cancel
            
             uploadMutation.mutate({ content: uploadContent, targetCampaignId: targetCampaignId || undefined })}
              disabled={!uploadContent.trim() || uploadMutation.isPending}
              data-testid="button-submit-upload"
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            
          
        
      

      
        
          
            Copy to Campaign
            
              Copy {selectedItems.size} selected suppression entries to another telemarketing campaign.
            
          
          
            
              
                Target Campaign
              
              
                
                  
                
                
                  {campaigns.map((campaign) => (
                    
                      {campaign.name}
                    
                  ))}
                
              
            
          
          
             setCopyDialogOpen(false)} data-testid="button-cancel-copy">
              Cancel
            
             copyToCampaignMutation.mutate({ ids: Array.from(selectedItems), targetCampaignId })}
              disabled={!targetCampaignId || copyToCampaignMutation.isPending}
              data-testid="button-submit-copy"
            >
              {copyToCampaignMutation.isPending ? "Copying..." : "Copy Suppressions"}
            
          
        
      

      
        
          
            Add to Campaign Suppressions
            
              Add {selectedLeads.size} qualified lead(s) to a campaign suppression list to prevent re-calling.
            
          
          
            
              
                Target Campaign
              
              
                
                  
                
                
                  {campaigns.map((campaign) => (
                    
                      {campaign.name}
                    
                  ))}
                
              
            
            
              
                Suppression Type
              
              
                
                  
                
                
                  Contact (by person)
                  Account (entire company)
                
              
              
                {suppressType === 'contact' 
                  ? "Only the specific contact will be suppressed" 
                  : "The entire company/account will be suppressed"}
              
            
          
          
             setAddLeadsDialogOpen(false)} data-testid="button-cancel-add-leads">
              Cancel
            
             addFromLeadsMutation.mutate({ 
                leadIds: Array.from(selectedLeads), 
                targetCampaignId: leadsTargetCampaign,
                suppressType,
              })}
              disabled={!leadsTargetCampaign || addFromLeadsMutation.isPending}
              data-testid="button-submit-add-leads"
            >
              {addFromLeadsMutation.isPending ? "Adding..." : "Add to Suppressions"}
            
          
        
      
    
  );
}