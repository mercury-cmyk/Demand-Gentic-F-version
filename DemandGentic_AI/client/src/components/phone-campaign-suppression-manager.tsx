import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

interface SuppressionResponse {
  data: T[];
  total: number;
  limit?: number;
  offset?: number;
}
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Upload, Trash2, Plus, FileText, AlertCircle, CheckCircle2, Building2, Mail, Globe, Phone } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface PhoneCampaignSuppressionManagerProps {
  campaignId: string;
  isCompact?: boolean;
}

interface SuppressionAccount {
  id: string;
  campaignId: string;
  accountId: string;
  accountName: string | null;
  accountDomain: string | null;
  accountIndustry: string | null;
  reason: string | null;
  addedBy: string | null;
  createdAt: string;
}

interface SuppressionContact {
  id: string;
  campaignId: string;
  contactId: string;
  contactEmail: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactCompany: string | null;
  reason: string | null;
  addedBy: string | null;
  createdAt: string;
}

interface SuppressionDomain {
  id: string;
  campaignId: string;
  domain: string;
  companyName: string | null;
  reason: string | null;
  addedBy: string | null;
  createdAt: string;
}

export function PhoneCampaignSuppressionManager({ 
  campaignId, 
  isCompact = false 
}: PhoneCampaignSuppressionManagerProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("accounts");
  
  // === SMART UPLOAD ===
  const [smartUploadContent, setSmartUploadContent] = useState("");
  const [smartUploadDialogOpen, setSmartUploadDialogOpen] = useState(false);
  const [smartUploadFileName, setSmartUploadFileName] = useState(null);
  
  // Account suppression state
  const [accountCsvContent, setAccountCsvContent] = useState("");
  const [accountUploadDialogOpen, setAccountUploadDialogOpen] = useState(false);
  
  // Contact suppression state
  const [contactCsvContent, setContactCsvContent] = useState("");
  const [contactUploadDialogOpen, setContactUploadDialogOpen] = useState(false);
  
  // Domain suppression state
  const [domainCsvContent, setDomainCsvContent] = useState("");
  const [domainManualContent, setDomainManualContent] = useState("");
  const [domainUploadDialogOpen, setDomainUploadDialogOpen] = useState(false);
  const [domainManualDialogOpen, setDomainManualDialogOpen] = useState(false);

  // Fetch account suppressions
  const { data: accountsData, isLoading: accountsLoading } = useQuery>({
    queryKey: ['/api/campaigns', campaignId, 'suppressions', 'accounts'],
    enabled: !!campaignId && activeTab === 'accounts',
  });

  // Fetch contact suppressions
  const { data: contactsData, isLoading: contactsLoading } = useQuery>({
    queryKey: ['/api/campaigns', campaignId, 'suppressions', 'contacts'],
    enabled: !!campaignId && activeTab === 'contacts',
  });

  // Fetch domain suppressions
  const { data: domainsData, isLoading: domainsLoading } = useQuery>({
    queryKey: ['/api/campaigns', campaignId, 'suppressions', 'domains'],
    enabled: !!campaignId && activeTab === 'domains',
  });

  const accountSuppressions = accountsData?.data || [];
  const accountTotalCount = accountsData?.total || 0;
  
  const contactSuppressions = contactsData?.data || [];
  const contactTotalCount = contactsData?.total || 0;
  
  const domainSuppressions = domainsData?.data || [];
  const domainTotalCount = domainsData?.total || 0;

  // Smart Upload mutation
  const smartUploadMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest(
        "POST",
        `/api/campaigns/${campaignId}/suppressions/smart-upload`,
        { csvContent: content }
      );
    },
    onSuccess: (data: any) => {
      toast({
        title: "✅ Smart Upload Complete",
        description: (
          
            {data?.totalAdded || 0} suppressions added
            
              Companies: {data?.summary?.companyNames?.added || 0} | 
              Domains: {data?.summary?.domains?.added || 0}
            
          
        ),
      });
      // Invalidate all suppression queries
      queryClient.invalidateQueries({ 
        queryKey: ['/api/campaigns', campaignId, 'suppressions'] 
      });
      setSmartUploadContent("");
      setSmartUploadFileName(null);
      setSmartUploadDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error?.message || "Failed to process CSV file",
        variant: "destructive",
      });
    },
  });

  const handleSmartUpload = () => {
    if (!smartUploadContent.trim()) {
      toast({
        title: "No Data",
        description: "Please upload a CSV file or paste company names / domain names",
        variant: "destructive",
      });
      return;
    }
    smartUploadMutation.mutate(smartUploadContent);
  };

  const handleSmartUploadFileChange = (e: React.ChangeEvent) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type (case-insensitive)
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a CSV file (.csv)",
        variant: "destructive",
      });
      // Clear input to allow retry
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setSmartUploadContent(content.trim());
      setSmartUploadFileName(file.name);
      // Clear input to allow re-uploading same filename
      e.target.value = "";
    };
    reader.onerror = () => {
      toast({
        title: "File Read Error",
        description: "Failed to read the CSV file",
        variant: "destructive",
      });
      // Clear input to allow retry
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  // Upload Account CSV mutation
  const uploadAccountCsvMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest(
        "POST",
        `/api/campaigns/${campaignId}/suppressions/accounts/upload`,
        { csvContent: content }
      );
    },
    onSuccess: (data: any) => {
      toast({
        title: "CSV Uploaded Successfully",
        description: `Added ${data.added} account(s) to suppression list. ${data.duplicates} duplicate(s) skipped.`,
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/campaigns', campaignId, 'suppressions', 'accounts'] 
      });
      setAccountCsvContent("");
      setAccountUploadDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error?.message || "Failed to upload CSV file",
        variant: "destructive",
      });
    },
  });

  // Upload Contact CSV mutation
  const uploadContactCsvMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest(
        "POST",
        `/api/campaigns/${campaignId}/suppressions/contacts/upload`,
        { csvContent: content }
      );
    },
    onSuccess: (data: any) => {
      toast({
        title: "CSV Uploaded Successfully",
        description: `Added ${data.added} contact(s) to suppression list. ${data.duplicates} duplicate(s) skipped.`,
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/campaigns', campaignId, 'suppressions', 'contacts'] 
      });
      setContactCsvContent("");
      setContactUploadDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error?.message || "Failed to upload CSV file",
        variant: "destructive",
      });
    },
  });

  // Upload Domain CSV mutation
  const uploadDomainCsvMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest(
        "POST",
        `/api/campaigns/${campaignId}/suppressions/domains/upload`,
        { csvContent: content }
      );
    },
    onSuccess: (data: any) => {
      toast({
        title: "CSV Uploaded Successfully",
        description: `Added ${data.added} domain(s) to suppression list. ${data.duplicates} duplicate(s) skipped.`,
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/campaigns', campaignId, 'suppressions', 'domains'] 
      });
      setDomainCsvContent("");
      setDomainUploadDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error?.message || "Failed to upload CSV file",
        variant: "destructive",
      });
    },
  });

  // Add manual domains mutation
  const addDomainsMutation = useMutation({
    mutationFn: async (domains: string[]) => {
      return await apiRequest(
        "POST",
        `/api/campaigns/${campaignId}/suppressions/domains`,
        { domains, reason: "Manually added" }
      );
    },
    onSuccess: (data: any) => {
      toast({
        title: "Domains Added",
        description: `Added ${data.added} domain(s) to suppression list.`,
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/campaigns', campaignId, 'suppressions', 'domains'] 
      });
      setDomainManualContent("");
      setDomainManualDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Domains",
        description: error?.message || "Please check your domain format",
        variant: "destructive",
      });
    },
  });

  // Delete account mutation
  const deleteAccountMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(
        "DELETE",
        `/api/campaigns/${campaignId}/suppressions/accounts/${id}`
      );
    },
    onSuccess: () => {
      toast({
        title: "Account Removed",
        description: "Account removed from suppression list",
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/campaigns', campaignId, 'suppressions', 'accounts'] 
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Remove Account",
        description: error?.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Delete contact mutation
  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(
        "DELETE",
        `/api/campaigns/${campaignId}/suppressions/contacts/${id}`
      );
    },
    onSuccess: () => {
      toast({
        title: "Contact Removed",
        description: "Contact removed from suppression list",
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/campaigns', campaignId, 'suppressions', 'contacts'] 
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Remove Contact",
        description: error?.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Delete domain mutation
  const deleteDomainMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(
        "DELETE",
        `/api/campaigns/${campaignId}/suppressions/domains/${id}`
      );
    },
    onSuccess: () => {
      toast({
        title: "Domain Removed",
        description: "Domain removed from suppression list",
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/campaigns', campaignId, 'suppressions', 'domains'] 
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Remove Domain",
        description: error?.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const handleAccountCsvUpload = () => {
    if (!accountCsvContent.trim()) {
      toast({
        title: "No Content",
        description: "Please paste CSV content before uploading",
        variant: "destructive",
      });
      return;
    }
    uploadAccountCsvMutation.mutate(accountCsvContent);
  };

  const handleContactCsvUpload = () => {
    if (!contactCsvContent.trim()) {
      toast({
        title: "No Content",
        description: "Please paste CSV content before uploading",
        variant: "destructive",
      });
      return;
    }
    uploadContactCsvMutation.mutate(contactCsvContent);
  };

  const handleDomainCsvUpload = () => {
    if (!domainCsvContent.trim()) {
      toast({
        title: "No Content",
        description: "Please paste CSV content before uploading",
        variant: "destructive",
      });
      return;
    }
    uploadDomainCsvMutation.mutate(domainCsvContent);
  };

  const handleManualDomainAdd = () => {
    if (!domainManualContent.trim()) {
      toast({
        title: "No Domains",
        description: "Please enter at least one domain",
        variant: "destructive",
      });
      return;
    }

    const domains = domainManualContent
      .split(/[\n,]/)
      .map(d => d.trim())
      .filter(d => d.length > 0);

    if (domains.length === 0) {
      toast({
        title: "Invalid Domains",
        description: "No valid domains found",
        variant: "destructive",
      });
      return;
    }

    addDomainsMutation.mutate(domains);
  };

  const handleDeleteAccount = (id: string) => {
    if (confirm("Are you sure you want to remove this account from the suppression list?")) {
      deleteAccountMutation.mutate(id);
    }
  };

  const handleDeleteContact = (id: string) => {
    if (confirm("Are you sure you want to remove this contact from the suppression list?")) {
      deleteContactMutation.mutate(id);
    }
  };

  const handleDeleteDomain = (id: string) => {
    if (confirm("Are you sure you want to remove this domain from the suppression list?")) {
      deleteDomainMutation.mutate(id);
    }
  };

  if (isCompact) {
    return (
      
        
          
          
            Campaign-Level Suppression: Exclude specific accounts, contacts, or domains from this phone campaign only.
            This is separate from the global DNC (Do Not Call) list.
          
        
        
        
          
            
              Accounts {accountTotalCount > 0 && `(${accountTotalCount})`}
            
            
              Contacts {contactTotalCount > 0 && `(${contactTotalCount})`}
            
            
              Domains {domainTotalCount > 0 && `(${domainTotalCount})`}
            
          

          
            
              
                Suppress all contacts from specific accounts
              
              
                
                  
                    
                    Upload CSV
                  
                
                
                  
                    Upload Account Suppressions
                    
                      Paste CSV content with "account_id", "domain", or "company_name" column
                    
                  
                   setAccountCsvContent(e.target.value)}
                    rows={10}
                    data-testid="textarea-account-csv"
                  />
                  
                    
                    
                      CSV must have "account_id", "domain", or "company_name" column. System will automatically match accounts. Duplicates will be skipped.
                    
                  
                  
                     setAccountUploadDialogOpen(false)}
                      data-testid="button-cancel-account-upload"
                    >
                      Cancel
                    
                    
                      {uploadAccountCsvMutation.isPending ? "Uploading..." : "Upload"}
                    
                  
                
              
            
            
            {accountTotalCount > 0 && (
              
                
                
                  {accountTotalCount} account(s) suppressed for this campaign
                
              
            )}
          

          
            
              
                Suppress specific individual contacts
              
              
                
                  
                    
                    Upload CSV
                  
                
                
                  
                    Upload Contact Suppressions
                    
                      Paste CSV content with "contact_id" or "email" column
                    
                  
                   setContactCsvContent(e.target.value)}
                    rows={10}
                    data-testid="textarea-contact-csv"
                  />
                  
                    
                    
                      CSV must have "contact_id" or "email" column. Duplicates will be skipped.
                    
                  
                  
                     setContactUploadDialogOpen(false)}
                      data-testid="button-cancel-contact-upload"
                    >
                      Cancel
                    
                    
                      {uploadContactCsvMutation.isPending ? "Uploading..." : "Upload"}
                    
                  
                
              
            
            
            {contactTotalCount > 0 && (
              
                
                
                  {contactTotalCount} contact(s) suppressed for this campaign
                
              
            )}
          

          
            
              
                Suppress all contacts from specific company domains
              
              
                
                  
                    
                      
                      Add Domains
                    
                  
                  
                    
                      Add Domains to Suppression List
                      
                        Enter domains (one per line or comma-separated)
                      
                    
                     setDomainManualContent(e.target.value)}
                      rows={8}
                      data-testid="textarea-manual-domains"
                    />
                    
                       setDomainManualDialogOpen(false)}
                        data-testid="button-cancel-manual-domains"
                      >
                        Cancel
                      
                      
                        {addDomainsMutation.isPending ? "Adding..." : "Add Domains"}
                      
                    
                  
                

                
                  
                    
                      
                      Upload CSV
                    
                  
                  
                    
                      Upload Domain Suppressions
                      
                        Paste CSV content with "domain" or "company_name" column
                      
                    
                     setDomainCsvContent(e.target.value)}
                      rows={10}
                      data-testid="textarea-domain-csv"
                    />
                    
                      
                      
                        CSV must have "domain" or "company_name" column. Duplicates will be skipped.
                      
                    
                    
                       setDomainUploadDialogOpen(false)}
                        data-testid="button-cancel-domain-upload"
                      >
                        Cancel
                      
                      
                        {uploadDomainCsvMutation.isPending ? "Uploading..." : "Upload"}
                      
                    
                  
                
              
            
            
            {domainTotalCount > 0 && (
              
                
                
                  {domainTotalCount} domain(s) suppressed for this campaign
                
              
            )}
          
        
      
    );
  }

  return (
    
      
        Campaign-Level Suppressions
        
          Manage accounts, contacts, and domains excluded from this phone campaign (separate from global DNC)
        
      
      
        {/* SMART UPLOAD SECTION */}
        
          
            
              
                
                  
                
                
                  
                    Smart Suppression Upload
                  
                  
                    Upload company names & domains in one file - we'll handle the rest
                  
                
              
              
                
                  
                    
                    Upload Suppressions
                  
                
                
                  
                    
                      
                        
                      
                      Smart Suppression Upload
                    
                    
                      Upload a CSV file or paste company names / emails directly
                    
                  

                  {/* File Upload Section */}
                  
                    
                      
                      
                        
                          
                            
                            Choose CSV File
                          
                        
                      
                      {smartUploadFileName && (
                        
                          
                          {smartUploadFileName}
                        
                      )}
                    

                    
                      
                        
                      
                      
                        
                          Or paste directly
                        
                      
                    

                     setSmartUploadContent(e.target.value)}
                      rows={10}
                      className="font-mono text-sm"
                      data-testid="textarea-smart-upload-phone"
                    />
                  

                  
                    
                    
                      Supported formats:
                      
                        ✅ CSV with headers: "Email,Company Name" - processes both columns
                        ✅ Simple list: One email or company name per line
                        ✅ Auto-detection: Automatically identifies emails vs company names
                        ✅ Domain extraction: Automatically extracts domains from emails
                      
                    
                  
                  
                     {
                      setSmartUploadDialogOpen(false);
                      setSmartUploadContent("");
                      setSmartUploadFileName(null);
                    }}>
                      Cancel
                    
                    
                      {smartUploadMutation.isPending ? (
                        <>Processing...
                      ) : (
                        <>
                          
                          Upload & Process
                        
                      )}
                    
                  
                
              
            
          
          
            
              
                
                  
                  Company Names
                
                
                  Blocks all contacts from matching companies
                
              
              
                
                  
                  Domain Names
                
                
                  Blocks entire email domains from campaigns
                
              
              
                
                  
                  Auto Account Matching
                
                
                  Automatically finds and suppresses accounts
                
              
            
          
        

        
          
            
              Accounts {accountTotalCount > 0 && `(${accountTotalCount})`}
            
            
              Contacts {contactTotalCount > 0 && `(${contactTotalCount})`}
            
            
              Domains {domainTotalCount > 0 && `(${domainTotalCount})`}
            
          

          {/* Accounts Tab */}
          
            
              
                Suppress all contacts from specific accounts
              
              
                
                  
                    
                    Upload CSV
                  
                
                
                  
                    Upload Account Suppressions
                    
                      Paste CSV content with "account_id" or "domain" column
                    
                  
                   setAccountCsvContent(e.target.value)}
                    rows={10}
                    data-testid="textarea-account-csv-full"
                  />
                  
                    
                    
                      CSV must have "account_id" or "domain" column. Duplicates will be skipped.
                    
                  
                  
                     setAccountUploadDialogOpen(false)}
                    >
                      Cancel
                    
                    
                      {uploadAccountCsvMutation.isPending ? "Uploading..." : "Upload"}
                    
                  
                
              
            

            {accountsLoading ? (
              
                Loading suppressions...
              
            ) : accountSuppressions.length === 0 ? (
              
                
                
                  No account suppressions configured
                
                
                  Upload a CSV to suppress entire accounts
                
              
            ) : (
              
                
                  
                    
                      Account Name
                      Domain
                      Industry
                      Reason
                      Added
                      
                    
                  
                  
                    {accountSuppressions.map((suppression: SuppressionAccount) => (
                      
                        
                          {suppression.accountName || "—"}
                        
                        
                          {suppression.accountDomain || "—"}
                        
                        
                          {suppression.accountIndustry || "—"}
                        
                        
                          {suppression.reason || "—"}
                        
                        
                          {new Date(suppression.createdAt).toLocaleDateString()}
                        
                        
                           handleDeleteAccount(suppression.id)}
                            disabled={deleteAccountMutation.isPending}
                            data-testid={`button-delete-account-${suppression.id}`}
                          >
                            
                          
                        
                      
                    ))}
                  
                
              
            )}
          

          {/* Contacts Tab */}
          
            
              
                Suppress specific individual contacts
              
              
                
                  
                    
                    Upload CSV
                  
                
                
                  
                    Upload Contact Suppressions
                    
                      Paste CSV content with "contact_id" or "email" column
                    
                  
                   setContactCsvContent(e.target.value)}
                    rows={10}
                    data-testid="textarea-contact-csv-full"
                  />
                  
                    
                    
                      CSV must have "contact_id" or "email" column. Duplicates will be skipped.
                    
                  
                  
                     setContactUploadDialogOpen(false)}
                    >
                      Cancel
                    
                    
                      {uploadContactCsvMutation.isPending ? "Uploading..." : "Upload"}
                    
                  
                
              
            

            {contactsLoading ? (
              
                Loading suppressions...
              
            ) : contactSuppressions.length === 0 ? (
              
                
                
                  No contact suppressions configured
                
                
                  Upload a CSV to suppress specific contacts
                
              
            ) : (
              
                
                  
                    
                      Contact Name
                      Email
                      Phone
                      Company
                      Reason
                      Added
                      
                    
                  
                  
                    {contactSuppressions.map((suppression: SuppressionContact) => (
                      
                        
                          {suppression.contactName || "—"}
                        
                        
                          {suppression.contactEmail || "—"}
                        
                        
                          {suppression.contactPhone || "—"}
                        
                        
                          {suppression.contactCompany || "—"}
                        
                        
                          {suppression.reason || "—"}
                        
                        
                          {new Date(suppression.createdAt).toLocaleDateString()}
                        
                        
                           handleDeleteContact(suppression.id)}
                            disabled={deleteContactMutation.isPending}
                            data-testid={`button-delete-contact-${suppression.id}`}
                          >
                            
                          
                        
                      
                    ))}
                  
                
              
            )}
          

          {/* Domains Tab */}
          
            
              
                Suppress all contacts from specific company domains
              
              
                
                  
                    
                      
                      Add Domains
                    
                  
                  
                    
                      Add Domains to Suppression List
                      
                        Enter domains (one per line or comma-separated)
                      
                    
                     setDomainManualContent(e.target.value)}
                      rows={8}
                      data-testid="textarea-manual-domains-full"
                    />
                    
                       setDomainManualDialogOpen(false)}
                      >
                        Cancel
                      
                      
                        {addDomainsMutation.isPending ? "Adding..." : "Add Domains"}
                      
                    
                  
                

                
                  
                    
                      
                      Upload CSV
                    
                  
                  
                    
                      Upload Domain Suppressions
                      
                        Paste CSV content with "domain" or "company_name" column
                      
                    
                     setDomainCsvContent(e.target.value)}
                      rows={10}
                      data-testid="textarea-domain-csv-full"
                    />
                    
                      
                      
                        CSV must have "domain" or "company_name" column. Duplicates will be skipped.
                      
                    
                    
                       setDomainUploadDialogOpen(false)}
                      >
                        Cancel
                      
                      
                        {uploadDomainCsvMutation.isPending ? "Uploading..." : "Upload"}
                      
                    
                  
                
              
            

            {domainsLoading ? (
              
                Loading suppressions...
              
            ) : domainSuppressions.length === 0 ? (
              
                
                
                  No domain suppressions configured
                
                
                  Add domains manually or upload a CSV
                
              
            ) : (
              
                
                  
                    
                      Domain
                      Company Name
                      Reason
                      Added
                      
                    
                  
                  
                    {domainSuppressions.map((suppression: SuppressionDomain) => (
                      
                        
                          {suppression.domain || Company-based}
                        
                        
                          {suppression.companyName || "—"}
                        
                        
                          {suppression.reason || "—"}
                        
                        
                          {new Date(suppression.createdAt).toLocaleDateString()}
                        
                        
                           handleDeleteDomain(suppression.id)}
                            disabled={deleteDomainMutation.isPending}
                            data-testid={`button-delete-domain-${suppression.id}`}
                          >
                            
                          
                        
                      
                    ))}
                  
                
              
            )}
          
        
      
    
  );
}