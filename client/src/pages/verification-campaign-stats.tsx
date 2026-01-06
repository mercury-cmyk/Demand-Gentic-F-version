import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Mail,
  ShieldX,
  BarChart3,
  TrendingUp,
  Database,
  Download,
  Filter,
  X,
  Building2,
  RefreshCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CustomFieldDefinition } from "@shared/schema";

interface AccountCapStat {
  accountId: string;
  accountName: string;
  domain: string | null;
  contactCount: number;
  leadCap: number;
  remaining: number;
  percentUsed: number;
  isAtCap: boolean;
}

function AccountLeadCapsSection({ campaignId }: { campaignId: string }) {
  const { data: accountCaps = [], isLoading } = useQuery<AccountCapStat[]>({
    queryKey: ["/api/verification-campaigns", campaignId, "account-caps"],
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <Card data-testid="card-account-caps">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Per-Account Lead Caps
          </CardTitle>
          <CardDescription>Loading account cap statistics...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // If no caps configured or no accounts, don't show the section
  if (accountCaps.length === 0) {
    return null;
  }

  return (
    <Card data-testid="card-account-caps">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Building2 className="h-5 w-5" />
          Per-Account Lead Caps
        </CardTitle>
        <CardDescription>
          Contact distribution across accounts (capped campaigns only)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {accountCaps.map((account) => (
            <div key={account.accountId} className="space-y-2" data-testid={`account-cap-${account.accountId}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{account.accountName}</span>
                  {account.domain && (
                    <span className="text-xs text-muted-foreground">({account.domain})</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">
                    {account.contactCount} / {account.leadCap}
                  </span>
                  {account.isAtCap && (
                    <Badge variant="destructive" className="text-xs">
                      At Cap
                    </Badge>
                  )}
                </div>
              </div>
              <Progress
                value={account.percentUsed}
                className="h-2"
                data-testid={`progress-account-${account.accountId}`}
              />
              <p className="text-xs text-muted-foreground">
                {account.remaining} slots remaining ({account.percentUsed}% used)
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface Contact {
  id: string;
  fullName: string;
  email: string | null;
  title: string | null;
  accountName: string | null;
  verificationStatus: string;
  emailStatus: string;
  suppressed: boolean;
  eligibilityStatus: string;
  eligibilityReason: string | null;
}

interface FilterState {
  preset?: string;
  fullName?: string;
  email?: string;
  title?: string;
  phone?: string;
  accountName?: string;
  city?: string;
  state?: string;
  country?: string;
  eligibilityStatus?: string;
  verificationStatus?: string;
  emailStatus?: string;
  qaStatus?: string;
  suppressed?: string;
  customFields?: Record<string, string | undefined>;
}

interface CampaignStats {
  totalContacts: number;
  suppressedCount: number;
  activeCount: number;
  eligibleCount: number;
  validatedCount: number;
  okEmailCount: number;
  invalidEmailCount: number;
  submittedCount: number;
  inBufferCount: number;
}

interface Campaign {
  id: string;
  name: string;
  okRateTarget?: number;
  deliverabilityTarget?: number;
}

export default function VerificationCampaignStatsPage() {
  const { campaignId } = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  
  const [detailDialog, setDetailDialog] = useState<{
    open: boolean;
    title: string;
    filter: string;
  }>({ open: false, title: "", filter: "" });
  
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filters, setFilters] = useState<FilterState>({});

  const { data: campaign } = useQuery<Campaign>({
    queryKey: ["/api/verification-campaigns", campaignId],
  });

  const { data: stats } = useQuery<CampaignStats>({
    queryKey: ["/api/verification-campaigns", campaignId, "stats"],
    refetchInterval: 10000,
  });

  const { data: customFields = [] } = useQuery<CustomFieldDefinition[]>({
    queryKey: ['/api/custom-fields'],
  });

  const contactCustomFields = customFields.filter(f => f.entityType === 'contact');
  const accountCustomFields = customFields.filter(f => f.entityType === 'account');

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/verification-campaigns", campaignId, "all-contacts", detailDialog.filter],
    queryFn: async () => {
      if (!detailDialog.open || !detailDialog.filter) return [];
      
      const res = await fetch(
        `/api/verification-campaigns/${campaignId}/contacts?filter=${detailDialog.filter}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          },
          credentials: "include",
        }
      );
      if (!res.ok) throw new Error("Failed to fetch contacts");
      return res.json();
    },
    enabled: detailDialog.open && !!detailDialog.filter,
  });

  const exportMutation = useMutation({
    mutationFn: async (exportFilters: FilterState) => {
      const params = new URLSearchParams();
      
      if (exportFilters.preset) params.append('filter', exportFilters.preset);
      if (exportFilters.fullName) params.append('fullName', exportFilters.fullName);
      if (exportFilters.email) params.append('email', exportFilters.email);
      if (exportFilters.title) params.append('title', exportFilters.title);
      if (exportFilters.phone) params.append('phone', exportFilters.phone);
      if (exportFilters.accountName) params.append('accountName', exportFilters.accountName);
      if (exportFilters.city) params.append('city', exportFilters.city);
      if (exportFilters.state) params.append('state', exportFilters.state);
      if (exportFilters.country) params.append('country', exportFilters.country);
      if (exportFilters.eligibilityStatus) params.append('eligibilityStatus', exportFilters.eligibilityStatus);
      if (exportFilters.verificationStatus) params.append('verificationStatus', exportFilters.verificationStatus);
      if (exportFilters.emailStatus) params.append('emailStatus', exportFilters.emailStatus);
      if (exportFilters.qaStatus) params.append('qaStatus', exportFilters.qaStatus);
      if (exportFilters.suppressed) params.append('suppressed', exportFilters.suppressed);
      
      if (exportFilters.customFields) {
        params.append('customFields', JSON.stringify(exportFilters.customFields));
      }

      const res = await fetch(
        `/api/verification-campaigns/${campaignId}/export?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          },
          credentials: "include",
        }
      );

      if (!res.ok) throw new Error("Failed to export contacts");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `verification-contacts-${campaignId}-${new Date().toISOString()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Export successful",
        description: "Your contacts have been exported to CSV",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const revalidateMutation = useMutation({
    mutationFn: async () => {
      const result = await apiRequest("POST", `/api/verification-campaigns/${campaignId}/contacts/revalidate-emails`);
      return result;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "queue"] });
      toast({
        title: "Re-validation started",
        description: `${data.count} contacts queued for email validation. Background job will process them within 2 minutes.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Re-validation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const processPendingMutation = useMutation({
    mutationFn: async () => {
      const result = await apiRequest("POST", `/api/verification-campaigns/${campaignId}/process-pending-contacts`, {
        triggerEmailValidation: true,
        batchSize: 1000,
      });
      return result;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "queue"] });
      toast({
        title: "Processing complete",
        description: `Processed ${data.processed} contacts: ${data.eligible} eligible, ${data.ineligible} ineligible. ${data.validationJobId ? 'Email validation started.' : ''}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Processing failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const enforceCapsMutation = useMutation({
    mutationFn: async () => {
      const result = await apiRequest("POST", `/api/verification-campaigns/${campaignId}/enforce-caps`);
      return result;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "account-caps"] });
      toast({
        title: "Lead cap enforcement started",
        description: `Smart cap enforcement is running. It will keep the top ${data.cap || 10} highest-quality contacts per company.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Cap enforcement failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const reEvaluateMutation = useMutation({
    mutationFn: async () => {
      const result = await apiRequest("POST", `/api/verification-campaigns/${campaignId}/re-evaluate-eligibility`);
      return result;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/verification-campaigns", campaignId, "account-caps"] });
      toast({
        title: "Eligibility re-evaluation complete",
        description: `Fixed ${data.markedOutOfScope} contacts that were incorrectly marked as Eligible. ${data.remainEligible} contacts remain eligible.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Re-evaluation failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });


  const smartExportMutation = useMutation({
    mutationFn: async (exportFilters: FilterState & { templateId?: string }) => {
      const params = new URLSearchParams();
      
      if (exportFilters.preset) params.append('filter', exportFilters.preset);
      if (exportFilters.templateId) params.append('templateId', exportFilters.templateId);
      if (exportFilters.fullName) params.append('fullName', exportFilters.fullName);
      if (exportFilters.email) params.append('email', exportFilters.email);
      if (exportFilters.title) params.append('title', exportFilters.title);
      if (exportFilters.phone) params.append('phone', exportFilters.phone);
      if (exportFilters.accountName) params.append('accountName', exportFilters.accountName);
      if (exportFilters.city) params.append('city', exportFilters.city);
      if (exportFilters.state) params.append('state', exportFilters.state);
      if (exportFilters.country) params.append('country', exportFilters.country);
      if (exportFilters.eligibilityStatus) params.append('eligibilityStatus', exportFilters.eligibilityStatus);
      if (exportFilters.verificationStatus) params.append('verificationStatus', exportFilters.verificationStatus);
      if (exportFilters.emailStatus) params.append('emailStatus', exportFilters.emailStatus);
      if (exportFilters.qaStatus) params.append('qaStatus', exportFilters.qaStatus);
      if (exportFilters.suppressed) params.append('suppressed', exportFilters.suppressed);
      
      if (exportFilters.customFields) {
        params.append('customFields', JSON.stringify(exportFilters.customFields));
      }

      const res = await fetch(
        `/api/verification-campaigns/${campaignId}/export-smart?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('authToken')}`,
          },
          credentials: "include",
        }
      );

      if (!res.ok) throw new Error("Failed to export smart template");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `verification-smart-template-${campaignId}-${new Date().toISOString()}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onSuccess: () => {
      toast({
        title: "Smart export successful",
        description: "Your contacts have been exported with best phone and address selection",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Smart export failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const openDetail = (title: string, filter: string) => {
    setDetailDialog({ open: true, title, filter });
  };

  const closeDetail = () => {
    setDetailDialog({ open: false, title: "", filter: "" });
  };

  const handleExport = (preset?: string) => {
    if (preset) {
      exportMutation.mutate({ preset });
    } else {
      exportMutation.mutate(filters);
    }
  };

  const handleSmartExport = (preset?: string, templateId?: string) => {
    const params = preset ? { preset } : filters;
    if (templateId) {
      (params as any).templateId = templateId;
    }
    smartExportMutation.mutate(params);
  };

  const updateFilter = (key: keyof FilterState, value: string) => {
    setFilters(prev => ({
      ...prev,
      [key]: value || undefined,
    }));
  };

  const updateCustomField = (key: string, value: string) => {
    setFilters(prev => {
      const newCustomFields = { ...(prev.customFields || {}) };
      if (value) {
        newCustomFields[key] = value;
      } else {
        delete newCustomFields[key];
      }
      return {
        ...prev,
        customFields: newCustomFields,
      };
    });
  };

  const clearFilters = () => {
    setFilters({});
  };

  const hasActiveFilters = Object.keys(filters).some(key => {
    if (key === 'customFields') {
      return filters.customFields && Object.keys(filters.customFields).length > 0;
    }
    return filters[key as keyof FilterState];
  });

  if (!campaign || !stats) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading campaign stats...</div>
      </div>
    );
  }

  const okRate = stats.validatedCount > 0
    ? ((stats.okEmailCount / stats.validatedCount) * 100).toFixed(1)
    : "0";
  
  const deliverabilityRate = stats.validatedCount > 0
    ? ((stats.okEmailCount / stats.validatedCount) * 100).toFixed(1)
    : "0";
  
  const suppressionRate = stats.totalContacts > 0
    ? ((stats.suppressedCount / stats.totalContacts) * 100).toFixed(1)
    : "0";

  const targetOkRate = campaign.okRateTarget || 95;
  const targetDeliverability = campaign.deliverabilityTarget || 97;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate("/verification")}
                data-testid="button-back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-semibold" data-testid="text-campaign-name">
                  {campaign.name} - Campaign Statistics
                </h1>
                <p className="text-sm text-muted-foreground">
                  Real-time analytics and metrics
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                data-testid="button-toggle-filters"
              >
                <Filter className="h-4 w-4 mr-2" />
                {showAdvancedFilters ? "Hide Filters" : "Advanced Filters"}
              </Button>
              <Button
                variant="outline"
                onClick={() => revalidateMutation.mutate()}
                disabled={revalidateMutation.isPending}
                data-testid="button-revalidate-emails"
              >
                <RefreshCcw className={`h-4 w-4 mr-2 ${revalidateMutation.isPending ? 'animate-spin' : ''}`} />
                {revalidateMutation.isPending ? "Re-validating..." : "Re-validate Emails"}
              </Button>
              <Button
                variant="default"
                onClick={() => processPendingMutation.mutate()}
                disabled={processPendingMutation.isPending}
                data-testid="button-process-pending"
              >
                <Database className={`h-4 w-4 mr-2 ${processPendingMutation.isPending ? 'animate-spin' : ''}`} />
                {processPendingMutation.isPending ? "Processing..." : "Process Pending"}
              </Button>
              <Button
                variant="outline"
                onClick={() => reEvaluateMutation.mutate()}
                disabled={reEvaluateMutation.isPending}
                data-testid="button-reevaluate-eligibility"
              >
                <CheckCircle2 className={`h-4 w-4 mr-2 ${reEvaluateMutation.isPending ? 'animate-spin' : ''}`} />
                {reEvaluateMutation.isPending ? "Re-evaluating..." : "Fix Eligibility"}
              </Button>
              <Button
                variant="outline"
                onClick={() => enforceCapsMutation.mutate()}
                disabled={enforceCapsMutation.isPending}
                data-testid="button-enforce-caps"
              >
                <Building2 className={`h-4 w-4 mr-2 ${enforceCapsMutation.isPending ? 'animate-spin' : ''}`} />
                {enforceCapsMutation.isPending ? "Enforcing..." : "Enforce Lead Caps"}
              </Button>
              <Button
                onClick={() => navigate(`/verification/${campaignId}/console`)}
                data-testid="button-console"
              >
                Open Console
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-6 py-8 space-y-8">
        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          <Card data-testid="card-advanced-filters">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Advanced Filters</CardTitle>
                  <CardDescription>
                    Filter contacts by any field and export the results
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {hasActiveFilters && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearFilters}
                      data-testid="button-clear-filters"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Clear Filters
                    </Button>
                  )}
                  <Button
                    onClick={() => handleExport()}
                    disabled={exportMutation.isPending}
                    data-testid="button-export-filtered"
                    variant="outline"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {exportMutation.isPending ? "Exporting..." : "Export All Fields"}
                  </Button>
                  <Button
                    onClick={() => handleSmartExport()}
                    disabled={smartExportMutation.isPending}
                    data-testid="button-export-smart"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {smartExportMutation.isPending ? "Exporting..." : "Export Smart Template"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Contact Fields */}
              <div className="space-y-4">
                <div className="font-medium text-sm">Contact Fields</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs">Full Name</Label>
                    <Input
                      placeholder="e.g. John Doe"
                      value={filters.fullName || ''}
                      onChange={(e) => updateFilter('fullName', e.target.value)}
                      data-testid="input-filter-fullname"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Email</Label>
                    <Input
                      placeholder="e.g. john@example.com"
                      value={filters.email || ''}
                      onChange={(e) => updateFilter('email', e.target.value)}
                      data-testid="input-filter-email"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Title</Label>
                    <Input
                      placeholder="e.g. CEO"
                      value={filters.title || ''}
                      onChange={(e) => updateFilter('title', e.target.value)}
                      data-testid="input-filter-title"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Phone</Label>
                    <Input
                      placeholder="e.g. +1234567890"
                      value={filters.phone || ''}
                      onChange={(e) => updateFilter('phone', e.target.value)}
                      data-testid="input-filter-phone"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">City</Label>
                    <Input
                      placeholder="e.g. San Francisco"
                      value={filters.city || ''}
                      onChange={(e) => updateFilter('city', e.target.value)}
                      data-testid="input-filter-city"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">State</Label>
                    <Input
                      placeholder="e.g. California"
                      value={filters.state || ''}
                      onChange={(e) => updateFilter('state', e.target.value)}
                      data-testid="input-filter-state"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Country</Label>
                    <Input
                      placeholder="e.g. United States"
                      value={filters.country || ''}
                      onChange={(e) => updateFilter('country', e.target.value)}
                      data-testid="input-filter-country"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Account Fields */}
              <div className="space-y-4">
                <div className="font-medium text-sm">Account Fields</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs">Company Name</Label>
                    <Input
                      placeholder="e.g. Acme Corp"
                      value={filters.accountName || ''}
                      onChange={(e) => updateFilter('accountName', e.target.value)}
                      data-testid="input-filter-account"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* Status Fields */}
              <div className="space-y-4">
                <div className="font-medium text-sm">Status Fields</div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div>
                    <Label className="text-xs">Eligibility Status</Label>
                    <Select
                      value={filters.eligibilityStatus || 'all'}
                      onValueChange={(value) => updateFilter('eligibilityStatus', value === 'all' ? '' : value)}
                    >
                      <SelectTrigger data-testid="select-filter-eligibility">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="Eligible">Eligible</SelectItem>
                        <SelectItem value="Out_of_Scope">Out of Scope</SelectItem>
                        <SelectItem value="Duplicate">Duplicate</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Verification Status</Label>
                    <Select
                      value={filters.verificationStatus || 'all'}
                      onValueChange={(value) => updateFilter('verificationStatus', value === 'all' ? '' : value)}
                    >
                      <SelectTrigger data-testid="select-filter-verification">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Validated">Validated</SelectItem>
                        <SelectItem value="Invalid">Invalid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Email Status</Label>
                    <Select
                      value={filters.emailStatus || 'all'}
                      onValueChange={(value) => updateFilter('emailStatus', value === 'all' ? '' : value)}
                    >
                      <SelectTrigger data-testid="select-filter-email-status">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="ok">OK</SelectItem>
                        <SelectItem value="invalid">Invalid</SelectItem>
                        <SelectItem value="unknown">Unknown</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Suppressed</Label>
                    <Select
                      value={filters.suppressed || 'all'}
                      onValueChange={(value) => updateFilter('suppressed', value === 'all' ? '' : value)}
                    >
                      <SelectTrigger data-testid="select-filter-suppressed">
                        <SelectValue placeholder="All" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="true">Yes</SelectItem>
                        <SelectItem value="false">No</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Contact Custom Fields */}
              {contactCustomFields.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <div className="font-medium text-sm">Contact Custom Fields</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {contactCustomFields.map((field) => (
                        <div key={field.id}>
                          <Label className="text-xs">{field.displayLabel}</Label>
                          <Input
                            placeholder={`Enter ${field.displayLabel.toLowerCase()}`}
                            value={filters.customFields?.[`contact.${field.fieldKey}`] || ''}
                            onChange={(e) => updateCustomField(`contact.${field.fieldKey}`, e.target.value)}
                            data-testid={`input-filter-custom-${field.fieldKey}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Account Custom Fields */}
              {accountCustomFields.length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <div className="font-medium text-sm">Account Custom Fields</div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {accountCustomFields.map((field) => (
                        <div key={field.id}>
                          <Label className="text-xs">{field.displayLabel}</Label>
                          <Input
                            placeholder={`Enter ${field.displayLabel.toLowerCase()}`}
                            value={filters.customFields?.[`account.${field.fieldKey}`] || ''}
                            onChange={(e) => updateCustomField(`account.${field.fieldKey}`, e.target.value)}
                            data-testid={`input-filter-account-custom-${field.fieldKey}`}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Contacts */}
          <Card
            className="hover-elevate active-elevate-2 cursor-pointer"
            onClick={() => openDetail("All Contacts", "all")}
            data-testid="card-total-contacts"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Contacts</CardTitle>
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExport('all');
                  }}
                  data-testid="button-export-all"
                >
                  <Download className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalContacts}</div>
              <p className="text-xs text-muted-foreground mt-1">
                All uploaded contacts
              </p>
            </CardContent>
          </Card>

          {/* Eligible */}
          <Card
            className="hover-elevate active-elevate-2 cursor-pointer"
            onClick={() => openDetail("Eligible Contacts", "eligible")}
            data-testid="card-eligible"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Eligible</CardTitle>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExport('eligible');
                  }}
                  data-testid="button-export-eligible"
                >
                  <Download className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.eligibleCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Meet campaign criteria
              </p>
            </CardContent>
          </Card>

          {/* Suppressed */}
          <Card
            className="hover-elevate active-elevate-2 cursor-pointer"
            onClick={() => openDetail("Suppressed Contacts", "suppressed")}
            data-testid="card-suppressed"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suppressed</CardTitle>
              <div className="flex items-center gap-2">
                <ShieldX className="h-4 w-4 text-red-500" />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExport('suppressed');
                  }}
                  data-testid="button-export-suppressed"
                >
                  <Download className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{stats.suppressedCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {suppressionRate}% of total
              </p>
            </CardContent>
          </Card>

          {/* Submitted */}
          <Card
            className="hover-elevate active-elevate-2 cursor-pointer"
            onClick={() => openDetail("Submitted Leads", "submitted")}
            data-testid="card-submitted"
          >
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Submitted</CardTitle>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExport('submitted');
                  }}
                  data-testid="button-export-submitted"
                >
                  <Download className="h-3 w-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.submittedCount}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Delivered to client
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Email Validation Section */}
        <Card data-testid="card-email-validation">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Email Validation Results
            </CardTitle>
            <CardDescription>
              Email validation with quality metrics
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Validation Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card
                className="hover-elevate active-elevate-2 cursor-pointer"
                onClick={() => openDetail("Validated Contacts", "validated")}
                data-testid="card-validated"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Validated</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.validatedCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Manually validated
                  </p>
                </CardContent>
              </Card>

              <Card
                className="hover-elevate active-elevate-2 cursor-pointer"
                onClick={() => openDetail("OK Emails", "ok_email")}
                data-testid="card-ok-email"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">OK Emails</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">{stats.okEmailCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Valid + Accept All
                  </p>
                </CardContent>
              </Card>

              <Card
                className="hover-elevate active-elevate-2 cursor-pointer"
                onClick={() => openDetail("Invalid Emails", "invalid_email")}
                data-testid="card-invalid-email"
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Invalid</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{stats.invalidEmailCount}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Failed validation
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Quality Metrics */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">OK Email Rate</span>
                  <span className="text-sm font-semibold">{okRate}%</span>
                </div>
                <Progress
                  value={parseFloat(okRate)}
                  className="h-2"
                  data-testid="progress-ok-rate"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Target: {targetOkRate}% (
                  {parseFloat(okRate) >= targetOkRate ? (
                    <span className="text-green-600">✓ Met</span>
                  ) : (
                    <span className="text-red-600">Below target</span>
                  )}
                  )
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">Deliverability Rate</span>
                  <span className="text-sm font-semibold">{deliverabilityRate}%</span>
                </div>
                <Progress
                  value={parseFloat(deliverabilityRate)}
                  className="h-2"
                  data-testid="progress-deliverability"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Target: {targetDeliverability}% (
                  {parseFloat(deliverabilityRate) >= targetDeliverability ? (
                    <span className="text-green-600">✓ Met</span>
                  ) : (
                    <span className="text-red-600">Below target</span>
                  )}
                  )
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Per-Account Lead Caps */}
        <AccountLeadCapsSection campaignId={campaignId!} />

        {/* Pipeline Status */}
        <Card data-testid="card-pipeline">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Verification Pipeline
            </CardTitle>
            <CardDescription>
              Contact flow through verification stages
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm">Total Uploaded</span>
                <Badge variant="secondary">{stats.totalContacts}</Badge>
              </div>
              <div className="flex items-center justify-between pl-4 border-l-2">
                <span className="text-sm">Eligible (not suppressed)</span>
                <Badge variant="secondary">{stats.eligibleCount}</Badge>
              </div>
              <div className="flex items-center justify-between pl-8 border-l-2">
                <span className="text-sm">Validated</span>
                <Badge variant="secondary">{stats.validatedCount}</Badge>
              </div>
              <div className="flex items-center justify-between pl-12 border-l-2">
                <span className="text-sm">OK Emails</span>
                <Badge className="bg-green-600">{stats.okEmailCount}</Badge>
              </div>
              <div className="flex items-center justify-between pl-16 border-l-2 border-blue-500">
                <span className="text-sm font-semibold">Submitted to Client</span>
                <Badge className="bg-blue-600">{stats.submittedCount}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      <Dialog open={detailDialog.open} onOpenChange={(open) => !open && closeDetail()}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>{detailDialog.title}</DialogTitle>
            <DialogDescription>
              {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-2">
              {contacts.map((contact) => (
                <Card key={contact.id} className="hover-elevate" data-testid={`contact-${contact.id}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="font-semibold">{contact.fullName}</div>
                        <div className="text-sm text-muted-foreground">{contact.email}</div>
                        <div className="text-sm text-muted-foreground">{contact.title}</div>
                        <div className="text-xs text-muted-foreground">{contact.accountName}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {contact.suppressed && (
                          <Badge variant="destructive">Suppressed</Badge>
                        )}
                        <Badge variant={contact.eligibilityStatus === 'Eligible' ? 'default' : 'secondary'}>
                          {contact.eligibilityStatus}
                        </Badge>
                        {contact.verificationStatus !== 'Pending' && (
                          <Badge variant={contact.verificationStatus === 'Validated' ? 'default' : 'secondary'}>
                            {contact.verificationStatus}
                          </Badge>
                        )}
                        {contact.emailStatus && contact.emailStatus !== 'unknown' && (
                          <Badge
                            variant={contact.emailStatus === 'ok' ? 'default' : 'destructive'}
                            className={contact.emailStatus === 'ok' ? 'bg-green-600' : ''}
                          >
                            {contact.emailStatus}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {contacts.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No contacts found
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
