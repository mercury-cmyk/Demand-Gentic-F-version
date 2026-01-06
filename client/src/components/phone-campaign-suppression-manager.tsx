import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

interface SuppressionResponse<T> {
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
  const [smartUploadFileName, setSmartUploadFileName] = useState<string | null>(null);
  
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
  const { data: accountsData, isLoading: accountsLoading } = useQuery<SuppressionResponse<SuppressionAccount>>({
    queryKey: ['/api/campaigns', campaignId, 'suppressions', 'accounts'],
    enabled: !!campaignId && activeTab === 'accounts',
  });

  // Fetch contact suppressions
  const { data: contactsData, isLoading: contactsLoading } = useQuery<SuppressionResponse<SuppressionContact>>({
    queryKey: ['/api/campaigns', campaignId, 'suppressions', 'contacts'],
    enabled: !!campaignId && activeTab === 'contacts',
  });

  // Fetch domain suppressions
  const { data: domainsData, isLoading: domainsLoading } = useQuery<SuppressionResponse<SuppressionDomain>>({
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
          <div className="space-y-1">
            <p><strong>{data?.totalAdded || 0}</strong> suppressions added</p>
            <p className="text-xs">
              Companies: {data?.summary?.companyNames?.added || 0} | 
              Domains: {data?.summary?.domains?.added || 0}
            </p>
          </div>
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

  const handleSmartUploadFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
      <div className="space-y-4">
        <Alert>
          <AlertCircle className="w-4 h-4" />
          <AlertDescription className="text-sm">
            <strong>Campaign-Level Suppression:</strong> Exclude specific accounts, contacts, or domains from this phone campaign only.
            This is separate from the global DNC (Do Not Call) list.
          </AlertDescription>
        </Alert>
        
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="accounts" data-testid="tab-accounts">
              Accounts {accountTotalCount > 0 && `(${accountTotalCount})`}
            </TabsTrigger>
            <TabsTrigger value="contacts" data-testid="tab-contacts">
              Contacts {contactTotalCount > 0 && `(${contactTotalCount})`}
            </TabsTrigger>
            <TabsTrigger value="domains" data-testid="tab-domains">
              Domains {domainTotalCount > 0 && `(${domainTotalCount})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="accounts" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Suppress all contacts from specific accounts
              </p>
              <Dialog open={accountUploadDialogOpen} onOpenChange={setAccountUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-upload-accounts">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload CSV
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upload Account Suppressions</DialogTitle>
                    <DialogDescription>
                      Paste CSV content with "account_id", "domain", or "company_name" column
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    placeholder="account_id&#10;abc-123&#10;def-456"
                    value={accountCsvContent}
                    onChange={(e) => setAccountCsvContent(e.target.value)}
                    rows={10}
                    data-testid="textarea-account-csv"
                  />
                  <Alert>
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription className="text-sm">
                      CSV must have "account_id", "domain", or "company_name" column. System will automatically match accounts. Duplicates will be skipped.
                    </AlertDescription>
                  </Alert>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setAccountUploadDialogOpen(false)}
                      data-testid="button-cancel-account-upload"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAccountCsvUpload}
                      disabled={uploadAccountCsvMutation.isPending}
                      data-testid="button-submit-account-upload"
                    >
                      {uploadAccountCsvMutation.isPending ? "Uploading..." : "Upload"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            
            {accountTotalCount > 0 && (
              <Alert>
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <AlertDescription className="text-sm">
                  {accountTotalCount} account(s) suppressed for this campaign
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="contacts" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Suppress specific individual contacts
              </p>
              <Dialog open={contactUploadDialogOpen} onOpenChange={setContactUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" data-testid="button-upload-contacts">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload CSV
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upload Contact Suppressions</DialogTitle>
                    <DialogDescription>
                      Paste CSV content with "contact_id" or "email" column
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    placeholder="contact_id&#10;xyz-789&#10;abc-123"
                    value={contactCsvContent}
                    onChange={(e) => setContactCsvContent(e.target.value)}
                    rows={10}
                    data-testid="textarea-contact-csv"
                  />
                  <Alert>
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription className="text-sm">
                      CSV must have "contact_id" or "email" column. Duplicates will be skipped.
                    </AlertDescription>
                  </Alert>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setContactUploadDialogOpen(false)}
                      data-testid="button-cancel-contact-upload"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleContactCsvUpload}
                      disabled={uploadContactCsvMutation.isPending}
                      data-testid="button-submit-contact-upload"
                    >
                      {uploadContactCsvMutation.isPending ? "Uploading..." : "Upload"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            
            {contactTotalCount > 0 && (
              <Alert>
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <AlertDescription className="text-sm">
                  {contactTotalCount} contact(s) suppressed for this campaign
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>

          <TabsContent value="domains" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Suppress all contacts from specific company domains
              </p>
              <div className="flex gap-2">
                <Dialog open={domainManualDialogOpen} onOpenChange={setDomainManualDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-add-domains">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Domains
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Domains to Suppression List</DialogTitle>
                      <DialogDescription>
                        Enter domains (one per line or comma-separated)
                      </DialogDescription>
                    </DialogHeader>
                    <Textarea
                      placeholder="example.com&#10;acme.com&#10;test.org"
                      value={domainManualContent}
                      onChange={(e) => setDomainManualContent(e.target.value)}
                      rows={8}
                      data-testid="textarea-manual-domains"
                    />
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setDomainManualDialogOpen(false)}
                        data-testid="button-cancel-manual-domains"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleManualDomainAdd}
                        disabled={addDomainsMutation.isPending}
                        data-testid="button-submit-manual-domains"
                      >
                        {addDomainsMutation.isPending ? "Adding..." : "Add Domains"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={domainUploadDialogOpen} onOpenChange={setDomainUploadDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" data-testid="button-upload-domains">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload CSV
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Upload Domain Suppressions</DialogTitle>
                      <DialogDescription>
                        Paste CSV content with "domain" or "company_name" column
                      </DialogDescription>
                    </DialogHeader>
                    <Textarea
                      placeholder="domain&#10;example.com&#10;acme.com"
                      value={domainCsvContent}
                      onChange={(e) => setDomainCsvContent(e.target.value)}
                      rows={10}
                      data-testid="textarea-domain-csv"
                    />
                    <Alert>
                      <AlertCircle className="w-4 h-4" />
                      <AlertDescription className="text-sm">
                        CSV must have "domain" or "company_name" column. Duplicates will be skipped.
                      </AlertDescription>
                    </Alert>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setDomainUploadDialogOpen(false)}
                        data-testid="button-cancel-domain-upload"
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleDomainCsvUpload}
                        disabled={uploadDomainCsvMutation.isPending}
                        data-testid="button-submit-domain-upload"
                      >
                        {uploadDomainCsvMutation.isPending ? "Uploading..." : "Upload"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
            
            {domainTotalCount > 0 && (
              <Alert>
                <CheckCircle2 className="w-4 h-4 text-green-500" />
                <AlertDescription className="text-sm">
                  {domainTotalCount} domain(s) suppressed for this campaign
                </AlertDescription>
              </Alert>
            )}
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Campaign-Level Suppressions</CardTitle>
        <CardDescription>
          Manage accounts, contacts, and domains excluded from this phone campaign (separate from global DNC)
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* SMART UPLOAD SECTION */}
        <Card className="mb-6 border-2 border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-purple-50/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg">
                  <Upload className="h-5 w-5 text-white" />
                </div>
                <div>
                  <CardTitle className="text-lg bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                    Smart Suppression Upload
                  </CardTitle>
                  <CardDescription>
                    Upload company names & domains in one file - we'll handle the rest
                  </CardDescription>
                </div>
              </div>
              <Dialog open={smartUploadDialogOpen} onOpenChange={setSmartUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="lg" className="gap-2" data-testid="button-smart-upload-phone">
                    <Upload className="w-4 h-4" />
                    Upload Suppressions
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                        <Upload className="h-4 w-4 text-white" />
                      </div>
                      Smart Suppression Upload
                    </DialogTitle>
                    <DialogDescription className="text-base">
                      Upload a CSV file or paste company names / emails directly
                    </DialogDescription>
                  </DialogHeader>

                  {/* File Upload Section */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        accept=".csv"
                        onChange={handleSmartUploadFileChange}
                        className="hidden"
                        id="smart-upload-file-input"
                        data-testid="input-smart-upload-file"
                      />
                      <label htmlFor="smart-upload-file-input">
                        <Button 
                          type="button" 
                          variant="outline" 
                          className="gap-2 cursor-pointer" 
                          asChild
                        >
                          <span>
                            <FileText className="w-4 h-4" />
                            Choose CSV File
                          </span>
                        </Button>
                      </label>
                      {smartUploadFileName && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 border border-green-200 rounded-md">
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-medium text-green-700">{smartUploadFileName}</span>
                        </div>
                      )}
                    </div>

                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t" />
                      </div>
                      <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-background px-2 text-muted-foreground">
                          Or paste directly
                        </span>
                      </div>
                    </div>

                    <Textarea
                      placeholder="Email,Company Name&#10;iain.summerfield@laser24.co.uk,LASER 24&#10;&#10;Or paste company names/emails one per line:&#10;Acme Corporation&#10;competitor.com&#10;example.co.uk"
                      value={smartUploadContent}
                      onChange={(e) => setSmartUploadContent(e.target.value)}
                      rows={10}
                      className="font-mono text-sm"
                      data-testid="textarea-smart-upload-phone"
                    />
                  </div>

                  <Alert className="bg-indigo-50/50 border-indigo-200">
                    <AlertCircle className="w-4 h-4 text-indigo-600" />
                    <AlertDescription>
                      <strong className="text-indigo-900">Supported formats:</strong>
                      <ul className="mt-2 space-y-1 text-sm text-indigo-800">
                        <li>✅ <strong>CSV with headers:</strong> "Email,Company Name" - processes both columns</li>
                        <li>✅ <strong>Simple list:</strong> One email or company name per line</li>
                        <li>✅ <strong>Auto-detection:</strong> Automatically identifies emails vs company names</li>
                        <li>✅ <strong>Domain extraction:</strong> Automatically extracts domains from emails</li>
                      </ul>
                    </AlertDescription>
                  </Alert>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => {
                      setSmartUploadDialogOpen(false);
                      setSmartUploadContent("");
                      setSmartUploadFileName(null);
                    }}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleSmartUpload}
                      disabled={smartUploadMutation.isPending}
                      className="gap-2"
                      data-testid="button-submit-smart-upload-phone"
                    >
                      {smartUploadMutation.isPending ? (
                        <>Processing...</>
                      ) : (
                        <>
                          <Upload className="w-4 h-4" />
                          Upload & Process
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-white/70 rounded-lg p-4 border border-indigo-100">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                  <p className="font-semibold text-sm text-gray-700">Company Names</p>
                </div>
                <p className="text-xs text-gray-600">
                  Blocks all contacts from matching companies
                </p>
              </div>
              <div className="bg-white/70 rounded-lg p-4 border border-purple-100">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="w-5 h-5 text-purple-600" />
                  <p className="font-semibold text-sm text-gray-700">Domain Names</p>
                </div>
                <p className="text-xs text-gray-600">
                  Blocks entire email domains from campaigns
                </p>
              </div>
              <div className="bg-white/70 rounded-lg p-4 border border-pink-100">
                <div className="flex items-center gap-2 mb-2">
                  <Phone className="w-5 h-5 text-pink-600" />
                  <p className="font-semibold text-sm text-gray-700">Auto Account Matching</p>
                </div>
                <p className="text-xs text-gray-600">
                  Automatically finds and suppresses accounts
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="accounts" data-testid="tab-accounts-full">
              Accounts {accountTotalCount > 0 && `(${accountTotalCount})`}
            </TabsTrigger>
            <TabsTrigger value="contacts" data-testid="tab-contacts-full">
              Contacts {contactTotalCount > 0 && `(${contactTotalCount})`}
            </TabsTrigger>
            <TabsTrigger value="domains" data-testid="tab-domains-full">
              Domains {domainTotalCount > 0 && `(${domainTotalCount})`}
            </TabsTrigger>
          </TabsList>

          {/* Accounts Tab */}
          <TabsContent value="accounts" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Suppress all contacts from specific accounts
              </p>
              <Dialog open={accountUploadDialogOpen} onOpenChange={setAccountUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-upload-accounts-full">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload CSV
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upload Account Suppressions</DialogTitle>
                    <DialogDescription>
                      Paste CSV content with "account_id" or "domain" column
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    placeholder="account_id&#10;abc-123&#10;def-456"
                    value={accountCsvContent}
                    onChange={(e) => setAccountCsvContent(e.target.value)}
                    rows={10}
                    data-testid="textarea-account-csv-full"
                  />
                  <Alert>
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription className="text-sm">
                      CSV must have "account_id" or "domain" column. Duplicates will be skipped.
                    </AlertDescription>
                  </Alert>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setAccountUploadDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAccountCsvUpload}
                      disabled={uploadAccountCsvMutation.isPending}
                    >
                      {uploadAccountCsvMutation.isPending ? "Uploading..." : "Upload"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {accountsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading suppressions...
              </div>
            ) : accountSuppressions.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  No account suppressions configured
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload a CSV to suppress entire accounts
                </p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account Name</TableHead>
                      <TableHead>Domain</TableHead>
                      <TableHead>Industry</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {accountSuppressions.map((suppression: SuppressionAccount) => (
                      <TableRow key={suppression.id}>
                        <TableCell className="font-medium">
                          {suppression.accountName || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {suppression.accountDomain || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {suppression.accountIndustry || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {suppression.reason || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(suppression.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAccount(suppression.id)}
                            disabled={deleteAccountMutation.isPending}
                            data-testid={`button-delete-account-${suppression.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Contacts Tab */}
          <TabsContent value="contacts" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Suppress specific individual contacts
              </p>
              <Dialog open={contactUploadDialogOpen} onOpenChange={setContactUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-upload-contacts-full">
                    <Upload className="w-4 h-4 mr-2" />
                    Upload CSV
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upload Contact Suppressions</DialogTitle>
                    <DialogDescription>
                      Paste CSV content with "contact_id" or "email" column
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    placeholder="contact_id&#10;xyz-789&#10;abc-123"
                    value={contactCsvContent}
                    onChange={(e) => setContactCsvContent(e.target.value)}
                    rows={10}
                    data-testid="textarea-contact-csv-full"
                  />
                  <Alert>
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription className="text-sm">
                      CSV must have "contact_id" or "email" column. Duplicates will be skipped.
                    </AlertDescription>
                  </Alert>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setContactUploadDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleContactCsvUpload}
                      disabled={uploadContactCsvMutation.isPending}
                    >
                      {uploadContactCsvMutation.isPending ? "Uploading..." : "Upload"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {contactsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading suppressions...
              </div>
            ) : contactSuppressions.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  No contact suppressions configured
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Upload a CSV to suppress specific contacts
                </p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contact Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contactSuppressions.map((suppression: SuppressionContact) => (
                      <TableRow key={suppression.id}>
                        <TableCell className="font-medium">
                          {suppression.contactName || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {suppression.contactEmail || "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {suppression.contactPhone || "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {suppression.contactCompany || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {suppression.reason || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(suppression.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteContact(suppression.id)}
                            disabled={deleteContactMutation.isPending}
                            data-testid={`button-delete-contact-${suppression.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Domains Tab */}
          <TabsContent value="domains" className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Suppress all contacts from specific company domains
              </p>
              <div className="flex gap-2">
                <Dialog open={domainManualDialogOpen} onOpenChange={setDomainManualDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" data-testid="button-add-domains-full">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Domains
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Domains to Suppression List</DialogTitle>
                      <DialogDescription>
                        Enter domains (one per line or comma-separated)
                      </DialogDescription>
                    </DialogHeader>
                    <Textarea
                      placeholder="example.com&#10;acme.com&#10;test.org"
                      value={domainManualContent}
                      onChange={(e) => setDomainManualContent(e.target.value)}
                      rows={8}
                      data-testid="textarea-manual-domains-full"
                    />
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setDomainManualDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleManualDomainAdd}
                        disabled={addDomainsMutation.isPending}
                      >
                        {addDomainsMutation.isPending ? "Adding..." : "Add Domains"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={domainUploadDialogOpen} onOpenChange={setDomainUploadDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-upload-domains-full">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload CSV
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Upload Domain Suppressions</DialogTitle>
                      <DialogDescription>
                        Paste CSV content with "domain" or "company_name" column
                      </DialogDescription>
                    </DialogHeader>
                    <Textarea
                      placeholder="domain&#10;example.com&#10;acme.com"
                      value={domainCsvContent}
                      onChange={(e) => setDomainCsvContent(e.target.value)}
                      rows={10}
                      data-testid="textarea-domain-csv-full"
                    />
                    <Alert>
                      <AlertCircle className="w-4 h-4" />
                      <AlertDescription className="text-sm">
                        CSV must have "domain" or "company_name" column. Duplicates will be skipped.
                      </AlertDescription>
                    </Alert>
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => setDomainUploadDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={handleDomainCsvUpload}
                        disabled={uploadDomainCsvMutation.isPending}
                      >
                        {uploadDomainCsvMutation.isPending ? "Uploading..." : "Upload"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {domainsLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading suppressions...
              </div>
            ) : domainSuppressions.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">
                  No domain suppressions configured
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Add domains manually or upload a CSV
                </p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead>Company Name</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {domainSuppressions.map((suppression: SuppressionDomain) => (
                      <TableRow key={suppression.id}>
                        <TableCell className="font-mono text-sm">
                          {suppression.domain || <span className="text-muted-foreground italic">Company-based</span>}
                        </TableCell>
                        <TableCell className="font-medium">
                          {suppression.companyName || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {suppression.reason || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(suppression.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDomain(suppression.id)}
                            disabled={deleteDomainMutation.isPending}
                            data-testid={`button-delete-domain-${suppression.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
