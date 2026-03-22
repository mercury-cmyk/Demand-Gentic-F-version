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
import { useExportAuthority } from "@/hooks/use-export-authority";
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
  const { data: accountCaps = [], isLoading } = useQuery({
    queryKey: ["/api/verification-campaigns", campaignId, "account-caps"],
    refetchInterval: 30000, // Increased from 10s to 30s
    refetchIntervalInBackground: false,
  });

  if (isLoading) {
    return (
      
        
          
            
            Per-Account Lead Caps
          
          Loading account cap statistics...
        
      
    );
  }

  // If no caps configured or no accounts, don't show the section
  if (accountCaps.length === 0) {
    return null;
  }

  return (
    
      
        
          
          Per-Account Lead Caps
        
        
          Contact distribution across accounts (capped campaigns only)
        
      
      
        
          {accountCaps.map((account) => (
            
              
                
                  {account.accountName}
                  {account.domain && (
                    ({account.domain})
                  )}
                
                
                  
                    {account.contactCount} / {account.leadCap}
                  
                  {account.isAtCap && (
                    
                      At Cap
                    
                  )}
                
              
              
              
                {account.remaining} slots remaining ({account.percentUsed}% used)
              
            
          ))}
        
      
    
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
  customFields?: Record;
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
  const { canExportData } = useExportAuthority();
  
  const [detailDialog, setDetailDialog] = useState({ open: false, title: "", filter: "" });
  
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [filters, setFilters] = useState({});

  const { data: campaign } = useQuery({
    queryKey: ["/api/verification-campaigns", campaignId],
  });

  const { data: stats } = useQuery({
    queryKey: ["/api/verification-campaigns", campaignId, "stats"],
    refetchInterval: 30000, // Increased from 10s to 30s
    refetchIntervalInBackground: false,
  });

  const { data: customFields = [] } = useQuery({
    queryKey: ['/api/custom-fields'],
  });

  const contactCustomFields = customFields.filter(f => f.entityType === 'contact');
  const accountCustomFields = customFields.filter(f => f.entityType === 'account');

  const { data: contacts = [] } = useQuery({
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
      
        Loading campaign stats...
      
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
    
      {/* Header */}
      
        
          
            
               navigate("/verification")}
                data-testid="button-back"
              >
                
              
              
                
                  {campaign.name} - Campaign Statistics
                
                
                  Real-time analytics and metrics
                
              
            
            
               setShowAdvancedFilters(!showAdvancedFilters)}
                data-testid="button-toggle-filters"
              >
                
                {showAdvancedFilters ? "Hide Filters" : "Advanced Filters"}
              
               revalidateMutation.mutate()}
                disabled={revalidateMutation.isPending}
                data-testid="button-revalidate-emails"
              >
                
                {revalidateMutation.isPending ? "Re-validating..." : "Re-validate Emails"}
              
               processPendingMutation.mutate()}
                disabled={processPendingMutation.isPending}
                data-testid="button-process-pending"
              >
                
                {processPendingMutation.isPending ? "Processing..." : "Process Pending"}
              
               reEvaluateMutation.mutate()}
                disabled={reEvaluateMutation.isPending}
                data-testid="button-reevaluate-eligibility"
              >
                
                {reEvaluateMutation.isPending ? "Re-evaluating..." : "Fix Eligibility"}
              
               enforceCapsMutation.mutate()}
                disabled={enforceCapsMutation.isPending}
                data-testid="button-enforce-caps"
              >
                
                {enforceCapsMutation.isPending ? "Enforcing..." : "Enforce Lead Caps"}
              
               navigate(`/verification/${campaignId}/console`)}
                data-testid="button-console"
              >
                Open Console
              
            
          
        
      

      {/* Content */}
      
        {/* Advanced Filters Panel */}
        {showAdvancedFilters && (
          
            
              
                
                  Advanced Filters
                  
                    Filter contacts by any field and export the results
                  
                
                
                  {hasActiveFilters && (
                    
                      
                      Clear Filters
                    
                  )}
                  {canExportData && (
                     handleExport()}
                      disabled={exportMutation.isPending}
                      data-testid="button-export-filtered"
                      variant="outline"
                    >
                      
                      {exportMutation.isPending ? "Exporting..." : "Export All Fields"}
                    
                  )}
                  {canExportData && (
                     handleSmartExport()}
                      disabled={smartExportMutation.isPending}
                      data-testid="button-export-smart"
                    >
                      
                      {smartExportMutation.isPending ? "Exporting..." : "Export Smart Template"}
                    
                  )}
                
              
            
            
              {/* Contact Fields */}
              
                Contact Fields
                
                  
                    Full Name
                     updateFilter('fullName', e.target.value)}
                      data-testid="input-filter-fullname"
                    />
                  
                  
                    Email
                     updateFilter('email', e.target.value)}
                      data-testid="input-filter-email"
                    />
                  
                  
                    Title
                     updateFilter('title', e.target.value)}
                      data-testid="input-filter-title"
                    />
                  
                  
                    Phone
                     updateFilter('phone', e.target.value)}
                      data-testid="input-filter-phone"
                    />
                  
                  
                    City
                     updateFilter('city', e.target.value)}
                      data-testid="input-filter-city"
                    />
                  
                  
                    State
                     updateFilter('state', e.target.value)}
                      data-testid="input-filter-state"
                    />
                  
                  
                    Country
                     updateFilter('country', e.target.value)}
                      data-testid="input-filter-country"
                    />
                  
                
              

              

              {/* Account Fields */}
              
                Account Fields
                
                  
                    Company Name
                     updateFilter('accountName', e.target.value)}
                      data-testid="input-filter-account"
                    />
                  
                
              

              

              {/* Status Fields */}
              
                Status Fields
                
                  
                    Eligibility Status
                     updateFilter('eligibilityStatus', value === 'all' ? '' : value)}
                    >
                      
                        
                      
                      
                        All
                        Eligible
                        Out of Scope
                        Duplicate
                      
                    
                  
                  
                    Verification Status
                     updateFilter('verificationStatus', value === 'all' ? '' : value)}
                    >
                      
                        
                      
                      
                        All
                        Pending
                        Validated
                        Invalid
                      
                    
                  
                  
                    Email Status
                     updateFilter('emailStatus', value === 'all' ? '' : value)}
                    >
                      
                        
                      
                      
                        All
                        OK
                        Invalid
                        Unknown
                      
                    
                  
                  
                    Suppressed
                     updateFilter('suppressed', value === 'all' ? '' : value)}
                    >
                      
                        
                      
                      
                        All
                        Yes
                        No
                      
                    
                  
                
              

              {/* Contact Custom Fields */}
              {contactCustomFields.length > 0 && (
                <>
                  
                  
                    Contact Custom Fields
                    
                      {contactCustomFields.map((field) => (
                        
                          {field.displayLabel}
                           updateCustomField(`contact.${field.fieldKey}`, e.target.value)}
                            data-testid={`input-filter-custom-${field.fieldKey}`}
                          />
                        
                      ))}
                    
                  
                
              )}

              {/* Account Custom Fields */}
              {accountCustomFields.length > 0 && (
                <>
                  
                  
                    Account Custom Fields
                    
                      {accountCustomFields.map((field) => (
                        
                          {field.displayLabel}
                           updateCustomField(`account.${field.fieldKey}`, e.target.value)}
                            data-testid={`input-filter-account-custom-${field.fieldKey}`}
                          />
                        
                      ))}
                    
                  
                
              )}
            
          
        )}

        {/* Overview Cards */}
        
          {/* Total Contacts */}
           openDetail("All Contacts", "all")}
            data-testid="card-total-contacts"
          >
            
              Total Contacts
              
                
                {canExportData && (
                   {
                      e.stopPropagation();
                      handleExport('all');
                    }}
                    data-testid="button-export-all"
                  >
                    
                  
                )}
              
            
            
              {stats.totalContacts}
              
                All uploaded contacts
              
            
          

          {/* Eligible */}
           openDetail("Eligible Contacts", "eligible")}
            data-testid="card-eligible"
          >
            
              Eligible
              
                
                {canExportData && (
                   {
                      e.stopPropagation();
                      handleExport('eligible');
                    }}
                    data-testid="button-export-eligible"
                  >
                    
                  
                )}
              
            
            
              {stats.eligibleCount}
              
                Meet campaign criteria
              
            
          

          {/* Suppressed */}
           openDetail("Suppressed Contacts", "suppressed")}
            data-testid="card-suppressed"
          >
            
              Suppressed
              
                
                {canExportData && (
                   {
                      e.stopPropagation();
                      handleExport('suppressed');
                    }}
                    data-testid="button-export-suppressed"
                  >
                    
                  
                )}
              
            
            
              {stats.suppressedCount}
              
                {suppressionRate}% of total
              
            
          

          {/* Submitted */}
           openDetail("Submitted Leads", "submitted")}
            data-testid="card-submitted"
          >
            
              Submitted
              
                
                {canExportData && (
                   {
                      e.stopPropagation();
                      handleExport('submitted');
                    }}
                    data-testid="button-export-submitted"
                  >
                    
                  
                )}
              
            
            
              {stats.submittedCount}
              
                Delivered to client
              
            
          
        

        {/* Email Validation Section */}
        
          
            
              
              Email Validation Results
            
            
              Email validation with quality metrics
            
          
          
            {/* Validation Status Cards */}
            
               openDetail("Validated Contacts", "validated")}
                data-testid="card-validated"
              >
                
                  Validated
                
                
                  {stats.validatedCount}
                  
                    Manually validated
                  
                
              

               openDetail("OK Emails", "ok_email")}
                data-testid="card-ok-email"
              >
                
                  OK Emails
                
                
                  {stats.okEmailCount}
                  
                    Valid + Accept All
                  
                
              

               openDetail("Invalid Emails", "invalid_email")}
                data-testid="card-invalid-email"
              >
                
                  Invalid
                
                
                  {stats.invalidEmailCount}
                  
                    Failed validation
                  
                
              
            

            {/* Quality Metrics */}
            
              
                
                  OK Email Rate
                  {okRate}%
                
                
                
                  Target: {targetOkRate}% (
                  {parseFloat(okRate) >= targetOkRate ? (
                    ✓ Met
                  ) : (
                    Below target
                  )}
                  )
                
              

              
                
                  Deliverability Rate
                  {deliverabilityRate}%
                
                
                
                  Target: {targetDeliverability}% (
                  {parseFloat(deliverabilityRate) >= targetDeliverability ? (
                    ✓ Met
                  ) : (
                    Below target
                  )}
                  )
                
              
            
          
        

        {/* Per-Account Lead Caps */}
        

        {/* Pipeline Status */}
        
          
            
              
              Verification Pipeline
            
            
              Contact flow through verification stages
            
          
          
            
              
                Total Uploaded
                {stats.totalContacts}
              
              
                Eligible (not suppressed)
                {stats.eligibleCount}
              
              
                Validated
                {stats.validatedCount}
              
              
                OK Emails
                {stats.okEmailCount}
              
              
                Submitted to Client
                {stats.submittedCount}
              
            
          
        
      

      {/* Detail Dialog */}
       !open && closeDetail()}>
        
          
            {detailDialog.title}
            
              {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
            
          
          
            
              {contacts.map((contact) => (
                
                  
                    
                      
                        {contact.fullName}
                        {contact.email}
                        {contact.title}
                        {contact.accountName}
                      
                      
                        {contact.suppressed && (
                          Suppressed
                        )}
                        
                          {contact.eligibilityStatus}
                        
                        {contact.verificationStatus !== 'Pending' && (
                          
                            {contact.verificationStatus}
                          
                        )}
                        {contact.emailStatus && contact.emailStatus !== 'unknown' && (
                          
                            {contact.emailStatus}
                          
                        )}
                      
                    
                  
                
              ))}
              {contacts.length === 0 && (
                
                  No contacts found
                
              )}
            
          
        
      
    
  );
}