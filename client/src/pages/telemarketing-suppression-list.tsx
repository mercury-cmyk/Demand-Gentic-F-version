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
  byType: Record<string, number>;
  bySource: Record<string, number>;
  byCampaign: Record<string, number>;
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
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("suppressions");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedCampaign, setSelectedCampaign] = useState<string>("all");
  const [selectedSource, setSelectedSource] = useState<string>("all");
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [uploadContent, setUploadContent] = useState("");
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [targetCampaignId, setTargetCampaignId] = useState<string>("");
  
  // Qualified leads state
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [addLeadsDialogOpen, setAddLeadsDialogOpen] = useState(false);
  const [leadsTargetCampaign, setLeadsTargetCampaign] = useState<string>("");
  const [leadsFilterCampaign, setLeadsFilterCampaign] = useState<string>("all");
  const [suppressType, setSuppressType] = useState<string>("contact");

  // Build query key with proper URL parameters
  const suppressionQueryKey = useMemo(() => {
    const params = new URLSearchParams();
    if (selectedType !== 'all') params.set('type', selectedType);
    if (selectedCampaign !== 'all') params.set('campaign', selectedCampaign);
    if (selectedSource !== 'all') params.set('source', selectedSource);
    const queryString = params.toString();
    return [`/api/telemarketing/suppressions${queryString ? `?${queryString}` : ''}`];
  }, [selectedType, selectedCampaign, selectedSource]);

  const { data: suppressionData, isLoading: suppressionsLoading, refetch: refetchSuppressions } = useQuery<{
    suppressions: SuppressionEntry[];
    stats: SuppressionStats;
  }>({
    queryKey: suppressionQueryKey,
  });

  const { data: campaigns = [] } = useQuery<Campaign[]>({
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

  const { data: qualifiedLeadsData, isLoading: qualifiedLeadsLoading, refetch: refetchQualifiedLeads } = useQuery<{
    leads: QualifiedLead[];
    total: number;
  }>({
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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      case 'account': return <Building2 className="h-4 w-4" />;
      case 'contact': return <Users className="h-4 w-4" />;
      case 'domain': return <Globe className="h-4 w-4" />;
      case 'phone':
      case 'global_dnc': return <Phone className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
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
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-telemarketing-suppressions">
            Telemarketing Suppression List
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage all suppression lists for telemarketing campaigns - uploaded, disposition-based, and global DNC
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline"
            onClick={() => refetchSuppressions()}
            data-testid="button-refresh-suppressions"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" data-testid="button-export-dropdown">
                <Download className="h-4 w-4 mr-2" />
                Export
                <ChevronDown className="h-4 w-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExport('csv')} data-testid="menu-item-export-csv">
                <FileDown className="h-4 w-4 mr-2" />
                Export as CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExport('json')} data-testid="menu-item-export-json">
                <FileDown className="h-4 w-4 mr-2" />
                Export as JSON
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button onClick={() => setUploadDialogOpen(true)} data-testid="button-upload-suppressions">
            <Upload className="h-4 w-4 mr-2" />
            Upload
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList data-testid="tabs-suppression-list">
          <TabsTrigger value="suppressions" data-testid="tab-suppressions">
            <Phone className="h-4 w-4 mr-2" />
            Suppressions
          </TabsTrigger>
          <TabsTrigger value="qualified-leads" data-testid="tab-qualified-leads">
            <UserCheck className="h-4 w-4 mr-2" />
            Qualified Leads
          </TabsTrigger>
        </TabsList>

        <TabsContent value="suppressions" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Suppressions</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-total-suppressions">
              {suppressionsLoading ? <Skeleton className="h-8 w-16" /> : stats.total.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Across all campaigns and sources
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Global DNC</CardTitle>
            <Phone className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-global-dnc">
              {suppressionsLoading ? <Skeleton className="h-8 w-16" /> : (stats.byType['global_dnc'] || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              From call dispositions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uploaded</CardTitle>
            <Upload className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-uploaded">
              {suppressionsLoading ? <Skeleton className="h-8 w-16" /> : (stats.bySource['upload'] || stats.bySource['CSV upload'] || 0).toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              From file uploads
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent (7 days)</CardTitle>
            <Plus className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold" data-testid="stat-recent">
              {suppressionsLoading ? <Skeleton className="h-8 w-16" /> : stats.recentAdditions.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              New additions this week
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle>Suppression Entries</CardTitle>
              <CardDescription>
                View, filter, and manage all suppression entries
              </CardDescription>
            </div>
            {selectedItems.size > 0 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setCopyDialogOpen(true)}
                  data-testid="button-copy-to-campaign"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Campaign ({selectedItems.size})
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate(Array.from(selectedItems))}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete-selected"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete ({selectedItems.size})
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by phone, email, company..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-suppressions"
              />
            </div>
            <Select value={selectedType} onValueChange={setSelectedType}>
              <SelectTrigger className="w-[150px]" data-testid="select-type-filter">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="account">Accounts</SelectItem>
                <SelectItem value="contact">Contacts</SelectItem>
                <SelectItem value="domain">Domains</SelectItem>
                <SelectItem value="phone">Phone Numbers</SelectItem>
                <SelectItem value="global_dnc">Global DNC</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedSource} onValueChange={setSelectedSource}>
              <SelectTrigger className="w-[180px]" data-testid="select-source-filter">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="upload">Uploaded</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="dnc">DNC</SelectItem>
              </SelectContent>
            </Select>
            <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
              <SelectTrigger className="w-[200px]" data-testid="select-campaign-filter">
                <SelectValue placeholder="Campaign" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Campaigns</SelectItem>
                <SelectItem value="global">Global (No Campaign)</SelectItem>
                {campaigns.map((campaign) => (
                  <SelectItem key={campaign.id} value={campaign.id}>
                    {campaign.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={selectedItems.size === filteredSuppressions.length && filteredSuppressions.length > 0 ? "secondary" : "outline"}
              onClick={handleSelectAll}
              disabled={filteredSuppressions.length === 0}
              data-testid="button-select-all-filtered"
            >
              <CheckSquare className="h-4 w-4 mr-2" />
              {selectedItems.size === filteredSuppressions.length && filteredSuppressions.length > 0 
                ? `Deselect All (${filteredSuppressions.length})` 
                : `Select All (${filteredSuppressions.length})`}
            </Button>
          </div>

          {suppressionsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredSuppressions.length > 0 ? (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={handleSelectAll}
                        data-testid="button-select-all"
                      >
                        {selectedItems.size === filteredSuppressions.length && filteredSuppressions.length > 0 ? (
                          <CheckSquare className="h-4 w-4" />
                        ) : (
                          <Square className="h-4 w-4" />
                        )}
                      </Button>
                    </TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Identifier</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Date Added</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSuppressions.map((suppression) => (
                    <TableRow key={suppression.id} data-testid={`row-suppression-${suppression.id}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedItems.has(suppression.id)}
                          onCheckedChange={() => handleSelectItem(suppression.id)}
                          data-testid={`checkbox-select-${suppression.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getTypeIcon(suppression.type)}
                          <span className="text-sm">{getTypeLabel(suppression.type)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-sm" data-testid={`text-identifier-${suppression.id}`}>
                        {suppression.identifier}
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`text-name-${suppression.id}`}>
                        {suppression.name || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getSourceBadgeVariant(suppression.source)} data-testid={`badge-source-${suppression.id}`}>
                          {suppression.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" data-testid={`text-reason-${suppression.id}`}>
                        {suppression.reason || '-'}
                      </TableCell>
                      <TableCell className="text-sm" data-testid={`text-campaign-${suppression.id}`}>
                        {suppression.campaignName || (suppression.campaignId ? suppression.campaignId : 'Global')}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground" data-testid={`text-date-${suppression.id}`}>
                        {format(new Date(suppression.createdAt), 'MMM d, yyyy')}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMutation.mutate([suppression.id])}
                          disabled={deleteMutation.isPending}
                          data-testid={`button-delete-${suppression.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState
              icon={Phone}
              title="No suppressions found"
              description={searchQuery || selectedType !== 'all' || selectedCampaign !== 'all' 
                ? "Try adjusting your filters" 
                : "Upload a suppression list or add entries manually to get started."}
              actionLabel="Upload List"
              onAction={() => setUploadDialogOpen(true)}
            />
          )}
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="qualified-leads" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle>Qualified Leads</CardTitle>
                  <CardDescription>
                    View successfully qualified leads and add them to suppression lists to prevent re-calling
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => refetchQualifiedLeads()}
                    data-testid="button-refresh-leads"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                  {selectedLeads.size > 0 && (
                    <Button
                      onClick={() => setAddLeadsDialogOpen(true)}
                      data-testid="button-add-to-suppressions"
                    >
                      <ShieldPlus className="h-4 w-4 mr-2" />
                      Add to Suppressions ({selectedLeads.size})
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4 mb-4 flex-wrap">
                <Select value={leadsFilterCampaign} onValueChange={setLeadsFilterCampaign}>
                  <SelectTrigger className="w-[250px]" data-testid="select-leads-campaign-filter">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by Campaign" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Campaigns</SelectItem>
                    {campaigns.map((campaign) => (
                      <SelectItem key={campaign.id} value={campaign.id}>
                        {campaign.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {qualifiedLeadsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : qualifiedLeads.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[50px]">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleSelectAllLeads}
                            data-testid="button-select-all-leads"
                          >
                            {selectedLeads.size === qualifiedLeads.length && qualifiedLeads.length > 0 ? (
                              <CheckSquare className="h-4 w-4" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </Button>
                        </TableHead>
                        <TableHead>Contact</TableHead>
                        <TableHead>Account</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Campaign</TableHead>
                        <TableHead>QA Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {qualifiedLeads.map((lead) => (
                        <TableRow key={lead.leadId} data-testid={`row-lead-${lead.leadId}`}>
                          <TableCell>
                            <Checkbox
                              checked={selectedLeads.has(lead.leadId)}
                              onCheckedChange={() => handleSelectLead(lead.leadId)}
                              data-testid={`checkbox-lead-${lead.leadId}`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-medium" data-testid={`text-lead-name-${lead.leadId}`}>
                                {lead.contactName}
                              </span>
                              {lead.contactEmail && (
                                <span className="text-xs text-muted-foreground">
                                  {lead.contactEmail}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell data-testid={`text-lead-account-${lead.leadId}`}>
                            {lead.accountName || '-'}
                          </TableCell>
                          <TableCell className="font-mono text-sm" data-testid={`text-lead-phone-${lead.leadId}`}>
                            {lead.contactPhone || '-'}
                          </TableCell>
                          <TableCell data-testid={`text-lead-campaign-${lead.leadId}`}>
                            {lead.campaignName || '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary" data-testid={`badge-qa-${lead.leadId}`}>
                              {lead.qaStatus || 'Qualified'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground" data-testid={`text-lead-date-${lead.leadId}`}>
                            {format(new Date(lead.createdAt), 'MMM d, yyyy')}
                          </TableCell>
                          <TableCell>
                            {(lead.isContactSuppressed || lead.isAccountSuppressed) ? (
                              <Badge variant="outline" className="text-green-600 border-green-600" data-testid={`badge-suppressed-${lead.leadId}`}>
                                <Phone className="h-3 w-3 mr-1" />
                                Suppressed
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">Not suppressed</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  icon={UserCheck}
                  title="No qualified leads found"
                  description={leadsFilterCampaign !== 'all' 
                    ? "Try selecting a different campaign" 
                    : "Qualified leads from your telemarketing campaigns will appear here."}
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-upload-suppressions">
          <DialogHeader>
            <DialogTitle>Upload Suppression List</DialogTitle>
            <DialogDescription>
              Upload a CSV file with phone numbers, emails, domains, or company names to add to the suppression list.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Target Campaign (Optional)
              </label>
              <Select value={targetCampaignId} onValueChange={setTargetCampaignId}>
                <SelectTrigger data-testid="select-upload-campaign">
                  <SelectValue placeholder="Global (applies to all campaigns)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Global (applies to all campaigns)</SelectItem>
                  {campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                CSV File or Paste Data
              </label>
              <div className="border-2 border-dashed rounded-lg p-6 text-center">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="csv-upload"
                  data-testid="input-file-upload"
                />
                <label htmlFor="csv-upload" className="cursor-pointer">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {uploadFileName || "Click to upload or drag and drop CSV file"}
                  </p>
                </label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Or paste data directly
              </label>
              <Textarea
                placeholder="Paste phone numbers, emails, or company names (one per line or CSV format)"
                value={uploadContent}
                onChange={(e) => setUploadContent(e.target.value)}
                rows={6}
                data-testid="textarea-paste-data"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)} data-testid="button-cancel-upload">
              Cancel
            </Button>
            <Button
              onClick={() => uploadMutation.mutate({ content: uploadContent, targetCampaignId: targetCampaignId || undefined })}
              disabled={!uploadContent.trim() || uploadMutation.isPending}
              data-testid="button-submit-upload"
            >
              {uploadMutation.isPending ? "Uploading..." : "Upload"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent data-testid="dialog-copy-to-campaign">
          <DialogHeader>
            <DialogTitle>Copy to Campaign</DialogTitle>
            <DialogDescription>
              Copy {selectedItems.size} selected suppression entries to another telemarketing campaign.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Target Campaign
              </label>
              <Select value={targetCampaignId} onValueChange={setTargetCampaignId}>
                <SelectTrigger data-testid="select-copy-target-campaign">
                  <SelectValue placeholder="Select a campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)} data-testid="button-cancel-copy">
              Cancel
            </Button>
            <Button
              onClick={() => copyToCampaignMutation.mutate({ ids: Array.from(selectedItems), targetCampaignId })}
              disabled={!targetCampaignId || copyToCampaignMutation.isPending}
              data-testid="button-submit-copy"
            >
              {copyToCampaignMutation.isPending ? "Copying..." : "Copy Suppressions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addLeadsDialogOpen} onOpenChange={setAddLeadsDialogOpen}>
        <DialogContent data-testid="dialog-add-leads-to-suppressions">
          <DialogHeader>
            <DialogTitle>Add to Campaign Suppressions</DialogTitle>
            <DialogDescription>
              Add {selectedLeads.size} qualified lead(s) to a campaign suppression list to prevent re-calling.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Target Campaign
              </label>
              <Select value={leadsTargetCampaign} onValueChange={setLeadsTargetCampaign}>
                <SelectTrigger data-testid="select-leads-target-campaign">
                  <SelectValue placeholder="Select a campaign" />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((campaign) => (
                    <SelectItem key={campaign.id} value={campaign.id}>
                      {campaign.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">
                Suppression Type
              </label>
              <Select value={suppressType} onValueChange={setSuppressType}>
                <SelectTrigger data-testid="select-suppress-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contact">Contact (by person)</SelectItem>
                  <SelectItem value="account">Account (entire company)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {suppressType === 'contact' 
                  ? "Only the specific contact will be suppressed" 
                  : "The entire company/account will be suppressed"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddLeadsDialogOpen(false)} data-testid="button-cancel-add-leads">
              Cancel
            </Button>
            <Button
              onClick={() => addFromLeadsMutation.mutate({ 
                leadIds: Array.from(selectedLeads), 
                targetCampaignId: leadsTargetCampaign,
                suppressType,
              })}
              disabled={!leadsTargetCampaign || addFromLeadsMutation.isPending}
              data-testid="button-submit-add-leads"
            >
              {addFromLeadsMutation.isPending ? "Adding..." : "Add to Suppressions"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
