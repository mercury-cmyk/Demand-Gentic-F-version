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

interface SuppressionResponse<T> {
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
  const [smartUploadFileName, setSmartUploadFileName] = useState<string | null>(null);

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
              Emails: {data?.summary?.emails?.added || 0} | 
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
        description: "Please upload a CSV file or paste company names / email addresses",
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

  // === EMAIL SUPPRESSIONS ===
  const [emailManualInput, setEmailManualInput] = useState("");
  const [emailCsvContent, setEmailCsvContent] = useState("");
  const [emailUploadDialogOpen, setEmailUploadDialogOpen] = useState(false);
  const [emailManualDialogOpen, setEmailManualDialogOpen] = useState(false);

  const { data: emailsData, isLoading: emailsLoading } = useQuery<SuppressionResponse<SuppressionEmail>>({
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

  const { data: accountsData, isLoading: accountsLoading } = useQuery<SuppressionResponse<SuppressionAccount>>({
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

  const { data: domainsData, isLoading: domainsLoading } = useQuery<SuppressionResponse<SuppressionDomain>>({
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

  const { data: contactsData, isLoading: contactsLoading } = useQuery<SuppressionResponse<SuppressionContact>>({
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Campaign Suppressions</CardTitle>
            <CardDescription>
              Manage suppressions for this campaign across emails, accounts, domains, and contacts
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-lg px-4 py-2">
            {totalSuppressions} Total Suppressions
          </Badge>
        </div>
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
                    Upload company names & emails in one file - we'll handle the rest
                  </CardDescription>
                </div>
              </div>
              <Dialog open={smartUploadDialogOpen} onOpenChange={setSmartUploadDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="lg" className="gap-2" data-testid="button-smart-upload">
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
                        id="smart-upload-file-input-email"
                        data-testid="input-smart-upload-file-email"
                      />
                      <label htmlFor="smart-upload-file-input-email">
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
                      placeholder="Email,Company Name&#10;iain.summerfield@laser24.co.uk,LASER 24&#10;&#10;Or paste company names/emails one per line:&#10;Acme Corporation&#10;competitor.com&#10;john@example.com"
                      value={smartUploadContent}
                      onChange={(e) => setSmartUploadContent(e.target.value)}
                      rows={10}
                      className="font-mono text-sm"
                      data-testid="textarea-smart-upload"
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
                      data-testid="button-submit-smart-upload"
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
                  <Mail className="w-5 h-5 text-purple-600" />
                  <p className="font-semibold text-sm text-gray-700">Email Addresses</p>
                </div>
                <p className="text-xs text-gray-600">
                  Blocks specific email addresses + extracts domains
                </p>
              </div>
              <div className="bg-white/70 rounded-lg p-4 border border-pink-100">
                <div className="flex items-center gap-2 mb-2">
                  <Globe className="w-5 h-5 text-pink-600" />
                  <p className="font-semibold text-sm text-gray-700">Auto Domain Matching</p>
                </div>
                <p className="text-xs text-gray-600">
                  Automatically blocks entire email domains
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="emails" className="gap-2" data-testid="tab-emails">
              <Mail className="w-4 h-4" />
              Emails ({emailCount})
            </TabsTrigger>
            <TabsTrigger value="accounts" className="gap-2" data-testid="tab-accounts">
              <Building2 className="w-4 h-4" />
              Accounts ({accountCount})
            </TabsTrigger>
            <TabsTrigger value="domains" className="gap-2" data-testid="tab-domains">
              <Globe className="w-4 h-4" />
              Domains ({domainCount})
            </TabsTrigger>
            <TabsTrigger value="contacts" className="gap-2" data-testid="tab-contacts">
              <Phone className="w-4 h-4" />
              Contacts ({contactCount})
            </TabsTrigger>
          </TabsList>

          {/* EMAILS TAB */}
          <TabsContent value="emails" className="space-y-4">
            <div className="flex items-center justify-between">
              <Alert className="flex-1 mr-4">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>
                  Suppress specific email addresses. Contacts with these emails will be excluded from this campaign.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Dialog open={emailManualDialogOpen} onOpenChange={setEmailManualDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" data-testid="button-add-emails">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Emails
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Email Suppressions</DialogTitle>
                      <DialogDescription>
                        Enter email addresses (one per line or comma-separated)
                      </DialogDescription>
                    </DialogHeader>
                    <Textarea
                      placeholder="email1@example.com&#10;email2@example.com"
                      value={emailManualInput}
                      onChange={(e) => setEmailManualInput(e.target.value)}
                      rows={8}
                      data-testid="textarea-manual-emails"
                    />
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setEmailManualDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleEmailManualAdd}
                        disabled={addEmailsMutation.isPending}
                        data-testid="button-submit-manual-emails"
                      >
                        {addEmailsMutation.isPending ? "Adding..." : "Add Emails"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={emailUploadDialogOpen} onOpenChange={setEmailUploadDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-upload-emails-csv">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload CSV
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Upload Email Suppressions CSV</DialogTitle>
                      <DialogDescription>
                        Paste CSV content with an "email" column
                      </DialogDescription>
                    </DialogHeader>
                    <Textarea
                      placeholder="email&#10;user1@example.com&#10;user2@example.com"
                      value={emailCsvContent}
                      onChange={(e) => setEmailCsvContent(e.target.value)}
                      rows={10}
                      data-testid="textarea-email-csv"
                    />
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setEmailUploadDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleEmailCsvUpload}
                        disabled={uploadEmailsCsvMutation.isPending}
                        data-testid="button-submit-email-csv"
                      >
                        {uploadEmailsCsvMutation.isPending ? "Uploading..." : "Upload"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {emailsLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : emails.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No email suppressions configured</p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {emails.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">{item.email}</TableCell>
                        <TableCell className="text-muted-foreground">{item.reason || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm("Remove this email from suppression list?")) {
                                deleteEmailMutation.mutate(item.id);
                              }
                            }}
                            data-testid={`button-delete-email-${item.id}`}
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

          {/* ACCOUNTS TAB */}
          <TabsContent value="accounts" className="space-y-4">
            <div className="flex items-center justify-between">
              <Alert className="flex-1 mr-4">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>
                  Suppress entire accounts/companies. All contacts from these accounts will be excluded.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Dialog open={accountManualDialogOpen} onOpenChange={setAccountManualDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" data-testid="button-add-accounts">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Accounts
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Account Suppressions</DialogTitle>
                      <DialogDescription>
                        Enter account IDs (one per line or comma-separated)
                      </DialogDescription>
                    </DialogHeader>
                    <Textarea
                      placeholder="account-id-123&#10;account-id-456"
                      value={accountManualInput}
                      onChange={(e) => setAccountManualInput(e.target.value)}
                      rows={8}
                      data-testid="textarea-manual-accounts"
                    />
                    <Alert>
                      <AlertCircle className="w-4 h-4" />
                      <AlertDescription className="text-sm">
                        Enter account IDs from your CRM database. For company names or domains, use CSV upload.
                      </AlertDescription>
                    </Alert>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setAccountManualDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleAccountManualAdd}
                        disabled={addAccountsMutation.isPending}
                        data-testid="button-submit-manual-accounts"
                      >
                        {addAccountsMutation.isPending ? "Adding..." : "Add Accounts"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={accountUploadDialogOpen} onOpenChange={setAccountUploadDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-upload-accounts-csv">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload CSV
                    </Button>
                  </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Upload Account Suppressions CSV</DialogTitle>
                    <DialogDescription>
                      Upload company names, domains, or account IDs (one per line)
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    placeholder="Acme Corporation&#10;example.com&#10;Another Company Ltd"
                    value={accountCsvContent}
                    onChange={(e) => setAccountCsvContent(e.target.value)}
                    rows={12}
                    data-testid="textarea-account-csv"
                  />
                  <Alert>
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription className="text-sm">
                      <strong>Supported formats:</strong>
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        <li>Company names (e.g., "Acme Corporation", "Example Ltd")</li>
                        <li>Domains (e.g., "acme.com", "example.co.uk")</li>
                        <li>Account IDs from your CRM database</li>
                      </ul>
                      The system will automatically match accounts by name or domain.
                    </AlertDescription>
                  </Alert>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAccountUploadDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleAccountCsvUpload}
                      disabled={uploadAccountsCsvMutation.isPending}
                      data-testid="button-submit-account-csv"
                    >
                      {uploadAccountsCsvMutation.isPending ? "Uploading..." : "Upload"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              </div>
            </div>

            {accountsLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No account suppressions configured</p>
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
                    {accounts.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.accountName || "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{item.accountDomain || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{item.accountIndustry || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{item.reason || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm("Remove this account from suppression list?")) {
                                deleteAccountMutation.mutate(item.id);
                              }
                            }}
                            data-testid={`button-delete-account-${item.id}`}
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

          {/* DOMAINS TAB */}
          <TabsContent value="domains" className="space-y-4">
            <div className="flex items-center justify-between">
              <Alert className="flex-1 mr-4">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>
                  Suppress by email domain or company name. Blocks all emails from these domains/companies.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Dialog open={domainManualDialogOpen} onOpenChange={setDomainManualDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" data-testid="button-add-domains">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Domains
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Domain Suppressions</DialogTitle>
                      <DialogDescription>
                        Enter domains or company names (one per line or comma-separated)
                      </DialogDescription>
                    </DialogHeader>
                    <Textarea
                      placeholder="example.com&#10;acme.co.uk&#10;Competitor Inc"
                      value={domainManualInput}
                      onChange={(e) => setDomainManualInput(e.target.value)}
                      rows={8}
                      data-testid="textarea-manual-domains"
                    />
                    <Alert>
                      <AlertCircle className="w-4 h-4" />
                      <AlertDescription className="text-sm">
                        Enter domains (e.g., "example.com") or company names. System automatically categorizes them.
                      </AlertDescription>
                    </Alert>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDomainManualDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleDomainManualAdd}
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
                    <Button data-testid="button-upload-domains-csv">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload CSV
                    </Button>
                  </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Upload Domain Suppressions CSV</DialogTitle>
                    <DialogDescription>
                      Upload email domains or company names (one per line)
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    placeholder="example.com&#10;acme.co.uk&#10;Competitor Company Inc"
                    value={domainCsvContent}
                    onChange={(e) => setDomainCsvContent(e.target.value)}
                    rows={12}
                    data-testid="textarea-domain-csv"
                  />
                  <Alert>
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription className="text-sm">
                      <strong>Supported formats:</strong>
                      <ul className="list-disc list-inside mt-2 space-y-1">
                        <li>Email domains (e.g., "example.com", "company.co.uk")</li>
                        <li>Company names (e.g., "Acme Corporation", "Example Ltd")</li>
                      </ul>
                      The system will normalize and match all emails from these domains or companies.
                    </AlertDescription>
                  </Alert>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDomainUploadDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleDomainCsvUpload}
                      disabled={uploadDomainsCsvMutation.isPending}
                      data-testid="button-submit-domain-csv"
                    >
                      {uploadDomainsCsvMutation.isPending ? "Uploading..." : "Upload"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              </div>
            </div>

            {domainsLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : domains.length === 0 ? (
              <div className="text-center py-12">
                <Globe className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No domain suppressions configured</p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain/Company Name</TableHead>
                      <TableHead>Company Reference</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {domains.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-sm">
                          {item.domain || <span className="text-muted-foreground italic">Company-based</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{item.companyName || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{item.reason || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm("Remove this domain from suppression list?")) {
                                deleteDomainMutation.mutate(item.id);
                              }
                            }}
                            data-testid={`button-delete-domain-${item.id}`}
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

          {/* CONTACTS TAB */}
          <TabsContent value="contacts" className="space-y-4">
            <div className="flex items-center justify-between">
              <Alert className="flex-1 mr-4">
                <AlertCircle className="w-4 h-4" />
                <AlertDescription>
                  Suppress specific contacts. These individual contacts will be excluded from this campaign.
                </AlertDescription>
              </Alert>
              <div className="flex gap-2">
                <Dialog open={contactManualDialogOpen} onOpenChange={setContactManualDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" data-testid="button-add-contacts">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Contacts
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Contact Suppressions</DialogTitle>
                      <DialogDescription>
                        Enter contact IDs (one per line or comma-separated)
                      </DialogDescription>
                    </DialogHeader>
                    <Textarea
                      placeholder="contact-id-123&#10;contact-id-456"
                      value={contactManualInput}
                      onChange={(e) => setContactManualInput(e.target.value)}
                      rows={8}
                      data-testid="textarea-manual-contacts"
                    />
                    <Alert>
                      <AlertCircle className="w-4 h-4" />
                      <AlertDescription className="text-sm">
                        Enter contact IDs from your CRM database.
                      </AlertDescription>
                    </Alert>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setContactManualDialogOpen(false)}>
                        Cancel
                      </Button>
                      <Button
                        onClick={handleContactManualAdd}
                        disabled={addContactsMutation.isPending}
                        data-testid="button-submit-manual-contacts"
                      >
                        {addContactsMutation.isPending ? "Adding..." : "Add Contacts"}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Dialog open={contactUploadDialogOpen} onOpenChange={setContactUploadDialogOpen}>
                  <DialogTrigger asChild>
                    <Button data-testid="button-upload-contacts-csv">
                      <Upload className="w-4 h-4 mr-2" />
                      Upload CSV
                    </Button>
                  </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Upload Contact Suppressions CSV</DialogTitle>
                    <DialogDescription>
                      Upload contact IDs or emails (one per line)
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    placeholder="contact-id-123&#10;john@example.com&#10;jane@company.com"
                    value={contactCsvContent}
                    onChange={(e) => setContactCsvContent(e.target.value)}
                    rows={10}
                    data-testid="textarea-contact-csv"
                  />
                  <Alert>
                    <AlertCircle className="w-4 h-4" />
                    <AlertDescription className="text-sm">
                      Upload contact IDs or email addresses to suppress specific contacts.
                    </AlertDescription>
                  </Alert>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setContactUploadDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleContactCsvUpload}
                      disabled={uploadContactsCsvMutation.isPending}
                      data-testid="button-submit-contact-csv"
                    >
                      {uploadContactsCsvMutation.isPending ? "Uploading..." : "Upload"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              </div>
            </div>

            {contactsLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : contacts.length === 0 ? (
              <div className="text-center py-12">
                <Phone className="w-12 h-4 mx-auto text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No contact suppressions configured</p>
              </div>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contact Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Added</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.contactName || "—"}</TableCell>
                        <TableCell className="font-mono text-sm">{item.contactEmail || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{item.contactTitle || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{item.reason || "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(item.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (confirm("Remove this contact from suppression list?")) {
                                deleteContactMutation.mutate(item.id);
                              }
                            }}
                            data-testid={`button-delete-contact-${item.id}`}
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
