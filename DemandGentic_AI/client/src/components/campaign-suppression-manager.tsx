import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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

interface CampaignSuppressionManagerProps {
  campaignId: string;
}

interface SuppressionResponse {
  data: T[];
  total: number;
  limit?: number;
  offset?: number;
}

interface SuppressionEmail {
  id: string;
  campaignId: string;
  email: string;
  emailNorm: string;
  reason: string | null;
  addedBy: string | null;
  createdAt: string;
}

interface SuppressionAccount {
  id: string;
  campaignId: string;
  accountId: string;
  reason: string | null;
  addedBy: string | null;
  createdAt: string;
  accountName?: string;
  accountDomain?: string;
  accountIndustry?: string;
}

interface SuppressionDomain {
  id: string;
  campaignId: string;
  domain: string;
  domainNorm: string;
  companyName: string | null;
  reason: string | null;
  addedBy: string | null;
  createdAt: string;
}

interface SuppressionContact {
  id: string;
  campaignId: string;
  contactId: string;
  reason: string | null;
  addedBy: string | null;
  createdAt: string;
  contactName?: string;
  contactEmail?: string;
  contactTitle?: string;
}

export function CampaignSuppressionManager({ campaignId }: CampaignSuppressionManagerProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("emails");

  // === SMART UPLOAD ===
  const [smartUploadContent, setSmartUploadContent] = useState("");
  const [smartUploadDialogOpen, setSmartUploadDialogOpen] = useState(false);
  const [smartUploadFileName, setSmartUploadFileName] = useState(null);

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
              Emails: {data?.summary?.emails?.added || 0} | 
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
        description: "Please upload a CSV file or paste company names / email addresses",
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

  // === EMAIL SUPPRESSIONS ===
  const [emailManualInput, setEmailManualInput] = useState("");
  const [emailCsvContent, setEmailCsvContent] = useState("");
  const [emailUploadDialogOpen, setEmailUploadDialogOpen] = useState(false);
  const [emailManualDialogOpen, setEmailManualDialogOpen] = useState(false);

  const { data: emailsData, isLoading: emailsLoading } = useQuery>({
    queryKey: ['/api/campaigns', campaignId, 'suppressions', 'emails'],
    enabled: !!campaignId,
  });

  const uploadEmailsCsvMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest(
        "POST",
        `/api/campaigns/${campaignId}/suppressions/emails/upload`,
        { csvContent: content }
      );
    },
    onSuccess: (data: any) => {
      toast({
        title: "Emails Uploaded Successfully",
        description: `Added ${data.added} email(s). ${data.duplicates} duplicate(s) skipped.`,
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/campaigns', campaignId, 'suppressions', 'emails'] 
      });
      setEmailCsvContent("");
      setEmailUploadDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error?.message || "Failed to upload CSV file",
        variant: "destructive",
      });
    },
  });

  const addEmailsMutation = useMutation({
    mutationFn: async (emails: string[]) => {
      return await apiRequest(
        "POST",
        `/api/campaigns/${campaignId}/suppressions/emails`,
        { emails, reason: "Manually added" }
      );
    },
    onSuccess: (data: any) => {
      toast({
        title: "Emails Added",
        description: `Added ${data.added} email(s) to suppression list.`,
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/campaigns', campaignId, 'suppressions', 'emails'] 
      });
      setEmailManualInput("");
      setEmailManualDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Emails",
        description: error?.message || "Please check your email format",
        variant: "destructive",
      });
    },
  });

  const deleteEmailMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/campaigns/${campaignId}/suppressions/emails/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Email Removed", description: "Email removed from suppression list" });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'suppressions', 'emails'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Remove Email",
        description: error?.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // === ACCOUNT SUPPRESSIONS ===
  const [accountManualInput, setAccountManualInput] = useState("");
  const [accountCsvContent, setAccountCsvContent] = useState("");
  const [accountManualDialogOpen, setAccountManualDialogOpen] = useState(false);
  const [accountUploadDialogOpen, setAccountUploadDialogOpen] = useState(false);

  const { data: accountsData, isLoading: accountsLoading } = useQuery>({
    queryKey: ['/api/campaigns', campaignId, 'suppressions', 'accounts'],
    enabled: !!campaignId,
  });

  const uploadAccountsCsvMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest(
        "POST",
        `/api/campaigns/${campaignId}/suppressions/accounts/upload`,
        { csvContent: content }
      );
    },
    onSuccess: (data: any) => {
      toast({
        title: "Accounts Uploaded Successfully",
        description: `Added ${data.added} account(s). ${data.duplicates} duplicate(s) skipped.`,
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
        description: error?.message || "Failed to upload accounts",
        variant: "destructive",
      });
    },
  });

  const addAccountsMutation = useMutation({
    mutationFn: async (accountIds: string[]) => {
      return await apiRequest(
        "POST",
        `/api/campaigns/${campaignId}/suppressions/accounts`,
        { accountIds, reason: "Manually added" }
      );
    },
    onSuccess: (data: any) => {
      toast({
        title: "Accounts Added",
        description: `Added ${data.added} account(s) to suppression list.`,
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/campaigns', campaignId, 'suppressions', 'accounts'] 
      });
      setAccountManualInput("");
      setAccountManualDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Accounts",
        description: error?.message || "Please check your account IDs",
        variant: "destructive",
      });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/campaigns/${campaignId}/suppressions/accounts/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Account Removed", description: "Account removed from suppression list" });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'suppressions', 'accounts'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Remove Account",
        description: error?.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // === DOMAIN SUPPRESSIONS ===
  const [domainManualInput, setDomainManualInput] = useState("");
  const [domainCsvContent, setDomainCsvContent] = useState("");
  const [domainManualDialogOpen, setDomainManualDialogOpen] = useState(false);
  const [domainUploadDialogOpen, setDomainUploadDialogOpen] = useState(false);

  const { data: domainsData, isLoading: domainsLoading } = useQuery>({
    queryKey: ['/api/campaigns', campaignId, 'suppressions', 'domains'],
    enabled: !!campaignId,
  });

  const uploadDomainsCsvMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest(
        "POST",
        `/api/campaigns/${campaignId}/suppressions/domains/upload`,
        { csvContent: content }
      );
    },
    onSuccess: (data: any) => {
      toast({
        title: "Domains Uploaded Successfully",
        description: `Added ${data.added} domain(s)/company name(s). ${data.duplicates} duplicate(s) skipped.`,
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
        description: error?.message || "Failed to upload domains",
        variant: "destructive",
      });
    },
  });

  const addDomainsMutation = useMutation({
    mutationFn: async (data: { domains?: string[], companyNames?: string[] }) => {
      return await apiRequest(
        "POST",
        `/api/campaigns/${campaignId}/suppressions/domains`,
        { ...data, reason: "Manually added" }
      );
    },
    onSuccess: (data: any) => {
      toast({
        title: "Domains Added",
        description: `Added ${data.added} domain(s)/company name(s) to suppression list.`,
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/campaigns', campaignId, 'suppressions', 'domains'] 
      });
      setDomainManualInput("");
      setDomainManualDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Domains",
        description: error?.message || "Please check your input",
        variant: "destructive",
      });
    },
  });

  const deleteDomainMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/campaigns/${campaignId}/suppressions/domains/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Domain Removed", description: "Domain removed from suppression list" });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'suppressions', 'domains'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Remove Domain",
        description: error?.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // === CONTACT SUPPRESSIONS ===
  const [contactManualInput, setContactManualInput] = useState("");
  const [contactCsvContent, setContactCsvContent] = useState("");
  const [contactManualDialogOpen, setContactManualDialogOpen] = useState(false);
  const [contactUploadDialogOpen, setContactUploadDialogOpen] = useState(false);

  const { data: contactsData, isLoading: contactsLoading } = useQuery>({
    queryKey: ['/api/campaigns', campaignId, 'suppressions', 'contacts'],
    enabled: !!campaignId,
  });

  const uploadContactsCsvMutation = useMutation({
    mutationFn: async (content: string) => {
      return await apiRequest(
        "POST",
        `/api/campaigns/${campaignId}/suppressions/contacts/upload`,
        { csvContent: content }
      );
    },
    onSuccess: (data: any) => {
      toast({
        title: "Contacts Uploaded Successfully",
        description: `Added ${data.added} contact(s). ${data.duplicates} duplicate(s) skipped.`,
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
        description: error?.message || "Failed to upload contacts",
        variant: "destructive",
      });
    },
  });

  const addContactsMutation = useMutation({
    mutationFn: async (contactIds: string[]) => {
      return await apiRequest(
        "POST",
        `/api/campaigns/${campaignId}/suppressions/contacts`,
        { contactIds, reason: "Manually added" }
      );
    },
    onSuccess: (data: any) => {
      toast({
        title: "Contacts Added",
        description: `Added ${data.added} contact(s) to suppression list.`,
      });
      queryClient.invalidateQueries({ 
        queryKey: ['/api/campaigns', campaignId, 'suppressions', 'contacts'] 
      });
      setContactManualInput("");
      setContactManualDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Add Contacts",
        description: error?.message || "Please check your contact IDs",
        variant: "destructive",
      });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/campaigns/${campaignId}/suppressions/contacts/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Contact Removed", description: "Contact removed from suppression list" });
      queryClient.invalidateQueries({ queryKey: ['/api/campaigns', campaignId, 'suppressions', 'contacts'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Remove Contact",
        description: error?.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handleEmailCsvUpload = () => {
    if (!emailCsvContent.trim()) {
      toast({ title: "No Content", description: "Please paste CSV content", variant: "destructive" });
      return;
    }
    uploadEmailsCsvMutation.mutate(emailCsvContent);
  };

  const handleEmailManualAdd = () => {
    if (!emailManualInput.trim()) {
      toast({ title: "No Emails", description: "Please enter at least one email", variant: "destructive" });
      return;
    }
    const emails = emailManualInput.split(/[\n,]/).map(e => e.trim()).filter(e => e.includes('@'));
    if (emails.length === 0) {
      toast({ title: "Invalid Emails", description: "No valid email addresses found", variant: "destructive" });
      return;
    }
    addEmailsMutation.mutate(emails);
  };

  const handleAccountCsvUpload = () => {
    if (!accountCsvContent.trim()) {
      toast({ title: "No Content", description: "Please paste CSV content", variant: "destructive" });
      return;
    }
    uploadAccountsCsvMutation.mutate(accountCsvContent);
  };

  const handleAccountManualAdd = () => {
    if (!accountManualInput.trim()) {
      toast({ title: "No IDs", description: "Please enter at least one account ID", variant: "destructive" });
      return;
    }
    const accountIds = accountManualInput.split(/[\n,]/).map(id => id.trim()).filter(id => id.length > 0);
    if (accountIds.length === 0) {
      toast({ title: "Invalid Input", description: "No valid account IDs found", variant: "destructive" });
      return;
    }
    addAccountsMutation.mutate(accountIds);
  };

  const handleDomainCsvUpload = () => {
    if (!domainCsvContent.trim()) {
      toast({ title: "No Content", description: "Please paste CSV content", variant: "destructive" });
      return;
    }
    uploadDomainsCsvMutation.mutate(domainCsvContent);
  };

  const handleDomainManualAdd = () => {
    if (!domainManualInput.trim()) {
      toast({ title: "No Input", description: "Please enter at least one domain or company name", variant: "destructive" });
      return;
    }
    const entries = domainManualInput.split(/[\n,]/).map(e => e.trim()).filter(e => e.length > 0);
    if (entries.length === 0) {
      toast({ title: "Invalid Input", description: "No valid entries found", variant: "destructive" });
      return;
    }
    // Separate domains from company names based on presence of dots
    const domains = entries.filter(e => e.includes('.') && !e.includes(' '));
    const companyNames = entries.filter(e => !e.includes('.') || e.includes(' '));
    
    if (domains.length === 0 && companyNames.length === 0) {
      toast({ title: "Invalid Input", description: "Please enter valid domains or company names", variant: "destructive" });
      return;
    }
    
    addDomainsMutation.mutate({
      domains: domains.length > 0 ? domains : undefined,
      companyNames: companyNames.length > 0 ? companyNames : undefined,
    });
  };

  const handleContactCsvUpload = () => {
    if (!contactCsvContent.trim()) {
      toast({ title: "No Content", description: "Please paste CSV content", variant: "destructive" });
      return;
    }
    uploadContactsCsvMutation.mutate(contactCsvContent);
  };

  const handleContactManualAdd = () => {
    if (!contactManualInput.trim()) {
      toast({ title: "No IDs", description: "Please enter at least one contact ID", variant: "destructive" });
      return;
    }
    const contactIds = contactManualInput.split(/[\n,]/).map(id => id.trim()).filter(id => id.length > 0);
    if (contactIds.length === 0) {
      toast({ title: "Invalid Input", description: "No valid contact IDs found", variant: "destructive" });
      return;
    }
    addContactsMutation.mutate(contactIds);
  };

  const emails = emailsData?.data || [];
  const emailCount = emailsData?.total || 0;
  const accounts = accountsData?.data || [];
  const accountCount = accountsData?.total || 0;
  const domains = domainsData?.data || [];
  const domainCount = domainsData?.total || 0;
  const contacts = contactsData?.data || [];
  const contactCount = contactsData?.total || 0;

  const totalSuppressions = emailCount + accountCount + domainCount + contactCount;

  return (
    
      
        
          
            Campaign Suppressions
            
              Manage suppressions for this campaign across emails, accounts, domains, and contacts
            
          
          
            {totalSuppressions} Total Suppressions
          
        
      
      
        {/* SMART UPLOAD SECTION */}
        
          
            
              
                
                  
                
                
                  
                    Smart Suppression Upload
                  
                  
                    Upload company names & emails in one file - we'll handle the rest
                  
                
              
              
                
                  
                    
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
                      data-testid="textarea-smart-upload"
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
                
              
              
                
                  
                  Email Addresses
                
                
                  Blocks specific email addresses + extracts domains
                
              
              
                
                  
                  Auto Domain Matching
                
                
                  Automatically blocks entire email domains
                
              
            
          
        

        
          
            
              
              Emails ({emailCount})
            
            
              
              Accounts ({accountCount})
            
            
              
              Domains ({domainCount})
            
            
              
              Contacts ({contactCount})
            
          

          {/* EMAILS TAB */}
          
            
              
                
                
                  Suppress specific email addresses. Contacts with these emails will be excluded from this campaign.
                
              
              
                
                  
                    
                      
                      Add Emails
                    
                  
                  
                    
                      Add Email Suppressions
                      
                        Enter email addresses (one per line or comma-separated)
                      
                    
                     setEmailManualInput(e.target.value)}
                      rows={8}
                      data-testid="textarea-manual-emails"
                    />
                    
                       setEmailManualDialogOpen(false)}>
                        Cancel
                      
                      
                        {addEmailsMutation.isPending ? "Adding..." : "Add Emails"}
                      
                    
                  
                

                
                  
                    
                      
                      Upload CSV
                    
                  
                  
                    
                      Upload Email Suppressions CSV
                      
                        Paste CSV content with an "email" column
                      
                    
                     setEmailCsvContent(e.target.value)}
                      rows={10}
                      data-testid="textarea-email-csv"
                    />
                    
                       setEmailUploadDialogOpen(false)}>
                        Cancel
                      
                      
                        {uploadEmailsCsvMutation.isPending ? "Uploading..." : "Upload"}
                      
                    
                  
                
              
            

            {emailsLoading ? (
              Loading...
            ) : emails.length === 0 ? (
              
                
                No email suppressions configured
              
            ) : (
              
                
                  
                    
                      Email
                      Reason
                      Added
                      
                    
                  
                  
                    {emails.map((item) => (
                      
                        {item.email}
                        {item.reason || "—"}
                        
                          {new Date(item.createdAt).toLocaleDateString()}
                        
                        
                           {
                              if (confirm("Remove this email from suppression list?")) {
                                deleteEmailMutation.mutate(item.id);
                              }
                            }}
                            data-testid={`button-delete-email-${item.id}`}
                          >
                            
                          
                        
                      
                    ))}
                  
                
              
            )}
          

          {/* ACCOUNTS TAB */}
          
            
              
                
                
                  Suppress entire accounts/companies. All contacts from these accounts will be excluded.
                
              
              
                
                  
                    
                      
                      Add Accounts
                    
                  
                  
                    
                      Add Account Suppressions
                      
                        Enter account IDs (one per line or comma-separated)
                      
                    
                     setAccountManualInput(e.target.value)}
                      rows={8}
                      data-testid="textarea-manual-accounts"
                    />
                    
                      
                      
                        Enter account IDs from your CRM database. For company names or domains, use CSV upload.
                      
                    
                    
                       setAccountManualDialogOpen(false)}>
                        Cancel
                      
                      
                        {addAccountsMutation.isPending ? "Adding..." : "Add Accounts"}
                      
                    
                  
                

                
                  
                    
                      
                      Upload CSV
                    
                  
                
                  
                    Upload Account Suppressions CSV
                    
                      Upload company names, domains, or account IDs (one per line)
                    
                  
                   setAccountCsvContent(e.target.value)}
                    rows={12}
                    data-testid="textarea-account-csv"
                  />
                  
                    
                    
                      Supported formats:
                      
                        Company names (e.g., "Acme Corporation", "Example Ltd")
                        Domains (e.g., "acme.com", "example.co.uk")
                        Account IDs from your CRM database
                      
                      The system will automatically match accounts by name or domain.
                    
                  
                  
                     setAccountUploadDialogOpen(false)}>
                      Cancel
                    
                    
                      {uploadAccountsCsvMutation.isPending ? "Uploading..." : "Upload"}
                    
                  
                
              
              
            

            {accountsLoading ? (
              Loading...
            ) : accounts.length === 0 ? (
              
                
                No account suppressions configured
              
            ) : (
              
                
                  
                    
                      Account Name
                      Domain
                      Industry
                      Reason
                      Added
                      
                    
                  
                  
                    {accounts.map((item) => (
                      
                        {item.accountName || "—"}
                        {item.accountDomain || "—"}
                        {item.accountIndustry || "—"}
                        {item.reason || "—"}
                        
                          {new Date(item.createdAt).toLocaleDateString()}
                        
                        
                           {
                              if (confirm("Remove this account from suppression list?")) {
                                deleteAccountMutation.mutate(item.id);
                              }
                            }}
                            data-testid={`button-delete-account-${item.id}`}
                          >
                            
                          
                        
                      
                    ))}
                  
                
              
            )}
          

          {/* DOMAINS TAB */}
          
            
              
                
                
                  Suppress by email domain or company name. Blocks all emails from these domains/companies.
                
              
              
                
                  
                    
                      
                      Add Domains
                    
                  
                  
                    
                      Add Domain Suppressions
                      
                        Enter domains or company names (one per line or comma-separated)
                      
                    
                     setDomainManualInput(e.target.value)}
                      rows={8}
                      data-testid="textarea-manual-domains"
                    />
                    
                      
                      
                        Enter domains (e.g., "example.com") or company names. System automatically categorizes them.
                      
                    
                    
                       setDomainManualDialogOpen(false)}>
                        Cancel
                      
                      
                        {addDomainsMutation.isPending ? "Adding..." : "Add Domains"}
                      
                    
                  
                

                
                  
                    
                      
                      Upload CSV
                    
                  
                
                  
                    Upload Domain Suppressions CSV
                    
                      Upload email domains or company names (one per line)
                    
                  
                   setDomainCsvContent(e.target.value)}
                    rows={12}
                    data-testid="textarea-domain-csv"
                  />
                  
                    
                    
                      Supported formats:
                      
                        Email domains (e.g., "example.com", "company.co.uk")
                        Company names (e.g., "Acme Corporation", "Example Ltd")
                      
                      The system will normalize and match all emails from these domains or companies.
                    
                  
                  
                     setDomainUploadDialogOpen(false)}>
                      Cancel
                    
                    
                      {uploadDomainsCsvMutation.isPending ? "Uploading..." : "Upload"}
                    
                  
                
              
              
            

            {domainsLoading ? (
              Loading...
            ) : domains.length === 0 ? (
              
                
                No domain suppressions configured
              
            ) : (
              
                
                  
                    
                      Domain/Company Name
                      Company Reference
                      Reason
                      Added
                      
                    
                  
                  
                    {domains.map((item) => (
                      
                        
                          {item.domain || Company-based}
                        
                        {item.companyName || "—"}
                        {item.reason || "—"}
                        
                          {new Date(item.createdAt).toLocaleDateString()}
                        
                        
                           {
                              if (confirm("Remove this domain from suppression list?")) {
                                deleteDomainMutation.mutate(item.id);
                              }
                            }}
                            data-testid={`button-delete-domain-${item.id}`}
                          >
                            
                          
                        
                      
                    ))}
                  
                
              
            )}
          

          {/* CONTACTS TAB */}
          
            
              
                
                
                  Suppress specific contacts. These individual contacts will be excluded from this campaign.
                
              
              
                
                  
                    
                      
                      Add Contacts
                    
                  
                  
                    
                      Add Contact Suppressions
                      
                        Enter contact IDs (one per line or comma-separated)
                      
                    
                     setContactManualInput(e.target.value)}
                      rows={8}
                      data-testid="textarea-manual-contacts"
                    />
                    
                      
                      
                        Enter contact IDs from your CRM database.
                      
                    
                    
                       setContactManualDialogOpen(false)}>
                        Cancel
                      
                      
                        {addContactsMutation.isPending ? "Adding..." : "Add Contacts"}
                      
                    
                  
                

                
                  
                    
                      
                      Upload CSV
                    
                  
                
                  
                    Upload Contact Suppressions CSV
                    
                      Upload contact IDs or emails (one per line)
                    
                  
                   setContactCsvContent(e.target.value)}
                    rows={10}
                    data-testid="textarea-contact-csv"
                  />
                  
                    
                    
                      Upload contact IDs or email addresses to suppress specific contacts.
                    
                  
                  
                     setContactUploadDialogOpen(false)}>
                      Cancel
                    
                    
                      {uploadContactsCsvMutation.isPending ? "Uploading..." : "Upload"}
                    
                  
                
              
              
            

            {contactsLoading ? (
              Loading...
            ) : contacts.length === 0 ? (
              
                
                No contact suppressions configured
              
            ) : (
              
                
                  
                    
                      Contact Name
                      Email
                      Title
                      Reason
                      Added
                      
                    
                  
                  
                    {contacts.map((item) => (
                      
                        {item.contactName || "—"}
                        {item.contactEmail || "—"}
                        {item.contactTitle || "—"}
                        {item.reason || "—"}
                        
                          {new Date(item.createdAt).toLocaleDateString()}
                        
                        
                           {
                              if (confirm("Remove this contact from suppression list?")) {
                                deleteContactMutation.mutate(item.id);
                              }
                            }}
                            data-testid={`button-delete-contact-${item.id}`}
                          >
                            
                          
                        
                      
                    ))}
                  
                
              
            )}
          
        
      
    
  );
}