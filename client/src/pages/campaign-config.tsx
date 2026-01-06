import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Mail, Phone, Settings2, Loader2, Trash2, Check, Building2, CheckCircle2, XCircle, AlertCircle, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  type SenderProfile,
  type EmailTemplate,
  type CallScript,
  insertSenderProfileSchema,
  insertEmailTemplateSchema,
  insertCallScriptSchema,
} from "@shared/schema";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";

export default function CampaignConfigPage() {
  const [activeTab, setActiveTab] = useState("sender-profiles");
  const [createProfileDialogOpen, setCreateProfileDialogOpen] = useState(false);
  const [createTemplateDialogOpen, setCreateTemplateDialogOpen] = useState(false);
  const [createScriptDialogOpen, setCreateScriptDialogOpen] = useState(false);
  const [selectedCampaignForValidation, setSelectedCampaignForValidation] = useState("");
  const { toast} = useToast();

  // Sender Profiles
  const { data: senderProfiles, isLoading: profilesLoading } = useQuery<SenderProfile[]>({
    queryKey: ['/api/sender-profiles'],
  });

  const senderProfileForm = useForm({
    resolver: zodResolver(insertSenderProfileSchema),
    defaultValues: {
      fromEmail: "",
      fromName: "",
      replyToEmail: "",
      isActive: true,
    },
  });

  const createProfileMutation = useMutation({
    mutationFn: async (data: any) => await apiRequest('POST', '/api/sender-profiles', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sender-profiles'], refetchType: 'active' });
      setCreateProfileDialogOpen(false);
      senderProfileForm.reset();
      toast({ title: "Success", description: "Sender profile created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create sender profile", variant: "destructive" });
    },
  });

  const deleteProfileMutation = useMutation({
    mutationFn: async (id: string) => await apiRequest('DELETE', `/api/sender-profiles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sender-profiles'], refetchType: 'active' });
      toast({ title: "Success", description: "Sender profile deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to delete sender profile", variant: "destructive" });
    },
  });

  // Email Templates
  const { data: emailTemplates, isLoading: templatesLoading } = useQuery<EmailTemplate[]>({
    queryKey: ['/api/email-templates'],
  });

  const emailTemplateForm = useForm({
    resolver: zodResolver(insertEmailTemplateSchema),
    defaultValues: {
      name: "",
      subject: "",
      htmlContent: "",
      version: 1,
      isApproved: false,
    },
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: any) => await apiRequest('POST', '/api/email-templates', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-templates'], refetchType: 'active' });
      setCreateTemplateDialogOpen(false);
      emailTemplateForm.reset();
      toast({ title: "Success", description: "Email template created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create email template", variant: "destructive" });
    },
  });

  const approveTemplateMutation = useMutation({
    mutationFn: async (id: string) => await apiRequest('POST', `/api/email-templates/${id}/approve`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-templates'], refetchType: 'active' });
      toast({ title: "Success", description: "Email template approved successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to approve email template", variant: "destructive" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: string) => await apiRequest('DELETE', `/api/email-templates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/email-templates'], refetchType: 'active' });
      toast({ title: "Success", description: "Email template deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to delete email template", variant: "destructive" });
    },
  });

  // Call Scripts
  const { data: callScripts, isLoading: scriptsLoading } = useQuery<CallScript[]>({
    queryKey: ['/api/call-scripts'],
  });

  const callScriptForm = useForm({
    resolver: zodResolver(insertCallScriptSchema),
    defaultValues: {
      name: "",
      content: "",
      version: 1,
    },
  });

  const createScriptMutation = useMutation({
    mutationFn: async (data: any) => await apiRequest('POST', '/api/call-scripts', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/call-scripts'], refetchType: 'active' });
      setCreateScriptDialogOpen(false);
      callScriptForm.reset();
      toast({ title: "Success", description: "Call script created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to create call script", variant: "destructive" });
    },
  });

  const deleteScriptMutation = useMutation({
    mutationFn: async (id: string) => await apiRequest('DELETE', `/api/call-scripts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/call-scripts'], refetchType: 'active' });
      toast({ title: "Success", description: "Call script deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to delete call script", variant: "destructive" });
    },
  });

  // Companies House Validation
  const { data: campaigns, isLoading: campaignsLoading } = useQuery<any[]>({
    queryKey: ['/api/campaigns'],
  });

  const { data: validationSummary, isLoading: summaryLoading } = useQuery<any>({
    queryKey: ['/api/campaigns', selectedCampaignForValidation, 'validation-summary'],
    enabled: !!selectedCampaignForValidation,
  });

  const validateCompaniesMutation = useMutation({
    mutationFn: async (campaignId: string) => {
      return await apiRequest('POST', `/api/campaigns/${campaignId}/validate-companies`, {});
    },
    onSuccess: (data: any) => {
      toast({
        title: "Validation Started",
        description: data.note || "Companies House validation is processing in the background.",
      });
      // Auto-refresh summary after 10 seconds
      setTimeout(() => {
        queryClient.invalidateQueries({ 
          queryKey: ['/api/campaigns', selectedCampaignForValidation, 'validation-summary'], 
          refetchType: 'active' 
        });
      }, 10000);
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Validation Failed",
        description: error.message || "Failed to start validation",
      });
    },
  });

  return (
    <div className="p-6 space-y-6" data-testid="page-campaign-config">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-semibold" data-testid="text-page-title">Campaign Configuration</h1>
          <p className="text-muted-foreground" data-testid="text-page-description">
            Manage sender profiles, email templates, and call scripts
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList data-testid="tabs-campaign-config">
          <TabsTrigger value="sender-profiles" data-testid="tab-sender-profiles">
            <Mail className="h-4 w-4 mr-2" />
            Sender Profiles
          </TabsTrigger>
          <TabsTrigger value="email-templates" data-testid="tab-email-templates">
            <Settings2 className="h-4 w-4 mr-2" />
            Email Templates
          </TabsTrigger>
          <TabsTrigger value="call-scripts" data-testid="tab-call-scripts">
            <Phone className="h-4 w-4 mr-2" />
            Call Scripts
          </TabsTrigger>
          <TabsTrigger value="companies-house" data-testid="tab-companies-house">
            <Building2 className="h-4 w-4 mr-2" />
            Companies House
          </TabsTrigger>
          <TabsTrigger value="delivery-templates" data-testid="tab-delivery-templates">
            <Settings2 className="h-4 w-4 mr-2" />
            Delivery Templates
          </TabsTrigger>
        </TabsList>

        {/* Sender Profiles Tab */}
        <TabsContent value="sender-profiles" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setCreateProfileDialogOpen(true)} data-testid="button-create-sender-profile">
              <Plus className="h-4 w-4 mr-2" />
              Create Sender Profile
            </Button>
          </div>

          {profilesLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-5 w-3/4" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-4 w-2/3" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {senderProfiles?.map((profile) => (
                <Card key={profile.id} data-testid={`card-sender-profile-${profile.id}`}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-base" data-testid={`text-profile-name-${profile.id}`}>
                        {profile.fromName}
                      </CardTitle>
                      <Badge variant={profile.isActive ? "default" : "secondary"} data-testid={`badge-profile-status-${profile.id}`}>
                        {profile.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm">
                      <p className="text-muted-foreground">From:</p>
                      <p className="font-mono text-xs" data-testid={`text-profile-from-${profile.id}`}>
                        {profile.fromName} &lt;{profile.fromEmail}&gt;
                      </p>
                    </div>
                    {profile.replyToEmail && (
                      <div className="text-sm">
                        <p className="text-muted-foreground">Reply-To:</p>
                        <p className="font-mono text-xs" data-testid={`text-profile-reply-${profile.id}`}>{profile.replyToEmail}</p>
                      </div>
                    )}
                    <div className="pt-2 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteProfileMutation.mutate(profile.id)}
                        disabled={deleteProfileMutation.isPending}
                        data-testid={`button-delete-profile-${profile.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Email Templates Tab */}
        <TabsContent value="email-templates" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setCreateTemplateDialogOpen(true)} data-testid="button-create-email-template">
              <Plus className="h-4 w-4 mr-2" />
              Create Email Template
            </Button>
          </div>

          {templatesLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-5 w-3/4" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-4 w-full mb-2" />
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {emailTemplates?.map((template) => (
                <Card key={template.id} data-testid={`card-email-template-${template.id}`}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-base" data-testid={`text-template-name-${template.id}`}>
                        {template.name}
                      </CardTitle>
                      <Badge variant={template.isApproved ? "default" : "secondary"} data-testid={`badge-template-status-${template.id}`}>
                        {template.isApproved ? "Approved" : "Draft"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm">
                      <p className="text-muted-foreground">Subject:</p>
                      <p className="font-medium" data-testid={`text-template-subject-${template.id}`}>{template.subject}</p>
                    </div>
                    <div className="text-sm">
                      <p className="text-muted-foreground">Version:</p>
                      <p data-testid={`text-template-version-${template.id}`}>{template.version}</p>
                    </div>
                    <div className="pt-2 flex justify-end gap-2">
                      {!template.isApproved && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => approveTemplateMutation.mutate(template.id)}
                          disabled={approveTemplateMutation.isPending}
                          data-testid={`button-approve-template-${template.id}`}
                        >
                          <Check className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteTemplateMutation.mutate(template.id)}
                        disabled={deleteTemplateMutation.isPending}
                        data-testid={`button-delete-template-${template.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Call Scripts Tab */}
        <TabsContent value="call-scripts" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => setCreateScriptDialogOpen(true)} data-testid="button-create-call-script">
              <Plus className="h-4 w-4 mr-2" />
              Create Call Script
            </Button>
          </div>

          {scriptsLoading ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[1, 2].map((i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-5 w-3/4" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {callScripts?.map((script) => (
                <Card key={script.id} data-testid={`card-call-script-${script.id}`}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-base" data-testid={`text-script-name-${script.id}`}>
                        {script.name}
                      </CardTitle>
                      <Badge variant="outline" data-testid={`badge-script-version-${script.id}`}>
                        v{script.version}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-sm">
                      <p className="text-muted-foreground">Content Preview:</p>
                      <p className="text-xs line-clamp-3 bg-muted p-2 rounded font-mono" data-testid={`text-script-content-${script.id}`}>
                        {script.content}
                      </p>
                    </div>
                    <div className="pt-2 flex justify-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteScriptMutation.mutate(script.id)}
                        disabled={deleteScriptMutation.isPending}
                        data-testid={`button-delete-script-${script.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Companies House Validation Tab */}
        <TabsContent value="companies-house" className="space-y-6">
          {/* Automation Settings Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="h-5 w-5" />
                Automation Settings
              </CardTitle>
              <CardDescription>
                Configure automatic validation when new leads are created
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Select Campaign</label>
                  <Select
                    value={selectedCampaignForValidation}
                    onValueChange={setSelectedCampaignForValidation}
                    disabled={campaignsLoading}
                  >
                    <SelectTrigger data-testid="select-automation-campaign">
                      <SelectValue placeholder="Choose a campaign to configure" />
                    </SelectTrigger>
                    <SelectContent>
                      {campaigns?.map((campaign: any) => (
                        <SelectItem key={campaign.id} value={campaign.id} data-testid={`option-automation-campaign-${campaign.id}`}>
                          {campaign.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {selectedCampaignForValidation && (
                <Card className="border-primary/20">
                  <CardContent className="pt-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <label className="text-sm font-medium">Auto-validate on Lead Creation</label>
                        <p className="text-sm text-muted-foreground">
                          Automatically validate companies when new leads are created for this campaign
                        </p>
                      </div>
                      <Switch
                        checked={
                          campaigns?.find((c: any) => c.id === selectedCampaignForValidation)?.companiesHouseValidation?.enabled &&
                          campaigns?.find((c: any) => c.id === selectedCampaignForValidation)?.companiesHouseValidation?.autoValidateOnLeadCreation
                        }
                        onCheckedChange={async (checked) => {
                          try {
                            await apiRequest('PATCH', `/api/campaigns/${selectedCampaignForValidation}`, {
                              companiesHouseValidation: {
                                enabled: true,
                                autoValidateOnLeadCreation: checked,
                              },
                            });
                            queryClient.invalidateQueries({ queryKey: ['/api/campaigns'], refetchType: 'active' });
                            toast({
                              title: "Settings Updated",
                              description: `Automatic validation ${checked ? 'enabled' : 'disabled'}`,
                            });
                          } catch (error) {
                            toast({
                              variant: "destructive",
                              title: "Failed to Update",
                              description: "Could not update automation settings",
                            });
                          }
                        }}
                        data-testid="switch-auto-validate"
                      />
                    </div>
                    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                      <p className="text-xs font-medium flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        How it works:
                      </p>
                      <ul className="text-xs text-muted-foreground space-y-1 ml-6 list-disc">
                        <li>When enabled, newly created leads will be automatically validated in the background</li>
                        <li>Company name suffixes (Ltd, Limited, Inc, LLC, etc.) are automatically normalized</li>
                        <li>Validation results appear in the lead's QA data within seconds</li>
                        <li>Rate limits: ~1.2s per lead to comply with Companies House API limits</li>
                      </ul>
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>

          {/* Bulk Validation Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />
                Bulk Validation
              </CardTitle>
              <CardDescription>
                Validate all existing leads for a campaign via Companies House API.
                This will check company status (must be Active), retrieve legal names, and registration numbers.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="text-sm font-medium mb-2 block">Select Campaign</label>
                  <Select
                    value={selectedCampaignForValidation}
                    onValueChange={setSelectedCampaignForValidation}
                    disabled={campaignsLoading}
                  >
                    <SelectTrigger data-testid="select-validation-campaign">
                      <SelectValue placeholder="Choose a campaign to validate" />
                    </SelectTrigger>
                    <SelectContent>
                      {campaigns?.map((campaign: any) => (
                        <SelectItem key={campaign.id} value={campaign.id} data-testid={`option-campaign-${campaign.id}`}>
                          {campaign.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => validateCompaniesMutation.mutate(selectedCampaignForValidation)}
                  disabled={!selectedCampaignForValidation || validateCompaniesMutation.isPending}
                  data-testid="button-validate-companies"
                >
                  {validateCompaniesMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Starting...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Validate Companies
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    queryClient.invalidateQueries({ 
                      queryKey: ['/api/campaigns', selectedCampaignForValidation, 'validation-summary'],
                      refetchType: 'active'
                    });
                  }}
                  disabled={!selectedCampaignForValidation}
                  data-testid="button-refresh-summary"
                >
                  Refresh
                </Button>
              </div>

              {selectedCampaignForValidation && (
                <>
                  {summaryLoading ? (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Card key={i}>
                          <CardContent className="pt-6">
                            <Skeleton className="h-8 w-full mb-2" />
                            <Skeleton className="h-4 w-3/4" />
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : validationSummary ? (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <AlertCircle className="h-4 w-4" />
                        <span>
                          Validation results for campaign leads. Note: Processing takes ~60-72 seconds per lead due to API rate limits (1.2s delay × 2 API calls per lead).
                        </span>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-2xl font-bold" data-testid="text-total-leads">{validationSummary.total}</div>
                            <p className="text-xs text-muted-foreground">Total Leads</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400" data-testid="text-validated-leads">
                              {validationSummary.validated}
                            </div>
                            <p className="text-xs text-muted-foreground">Validated</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-2xl font-bold text-green-600 dark:text-green-400 flex items-center gap-1" data-testid="text-active-companies">
                              {validationSummary.active}
                              <CheckCircle2 className="h-5 w-5" />
                            </div>
                            <p className="text-xs text-muted-foreground">Active</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1" data-testid="text-inactive-companies">
                              {validationSummary.inactive}
                              <XCircle className="h-5 w-5" />
                            </div>
                            <p className="text-xs text-muted-foreground">Inactive</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-2xl font-bold text-gray-600 dark:text-gray-400 flex items-center gap-1" data-testid="text-pending-validation">
                              {validationSummary.pending}
                              <Clock className="h-5 w-5" />
                            </div>
                            <p className="text-xs text-muted-foreground">Pending</p>
                          </CardContent>
                        </Card>
                        <Card>
                          <CardContent className="pt-6">
                            <div className="text-2xl font-bold text-red-600 dark:text-red-400 flex items-center gap-1" data-testid="text-api-errors">
                              {validationSummary.apiErrors || 0}
                              <XCircle className="h-5 w-5" />
                            </div>
                            <p className="text-xs text-muted-foreground">API Errors</p>
                          </CardContent>
                        </Card>
                      </div>

                      {validationSummary.notFound > 0 && (
                        <Card className="border-orange-200 dark:border-orange-800">
                          <CardContent className="pt-6">
                            <div className="flex items-center gap-2">
                              <AlertCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                              <div>
                                <p className="font-medium">Companies Not Found</p>
                                <p className="text-sm text-muted-foreground" data-testid="text-not-found-count">
                                  {validationSummary.notFound} companies could not be found in Companies House registry
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {validationSummary.apiErrors > 0 && (
                        <Card className="border-red-200 dark:border-red-800">
                          <CardContent className="pt-6">
                            <div className="flex items-center gap-2">
                              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                              <div>
                                <p className="font-medium">API Errors Encountered</p>
                                <p className="text-sm text-muted-foreground" data-testid="text-api-error-count">
                                  {validationSummary.apiErrors} validation requests failed due to API errors (network issues, rate limits, or service unavailability)
                                </p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      <Card className="bg-muted/50">
                        <CardContent className="pt-6">
                          <p className="text-sm">
                            <strong>Validation Data Stored:</strong> Each lead's QA data now includes:<br />
                            • Company House Status (Active/Inactive)<br />
                            • Company House Legal Name<br />
                            • Company House Registration Number<br />
                            • Registered Address<br />
                            • Date of Creation
                          </p>
                          <p className="text-xs text-muted-foreground mt-2">
                            View individual lead details in the Leads page to see complete validation data.
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="pt-6 text-center text-muted-foreground">
                        <p>No validation data available for this campaign yet.</p>
                        <p className="text-sm mt-2">Click "Validate Companies" to start the validation process.</p>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {!selectedCampaignForValidation && (
                <Card className="bg-muted/30">
                  <CardContent className="pt-6 text-center text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p className="font-medium">Select a campaign to begin validation</p>
                    <p className="text-sm mt-2">
                      Choose a campaign from the dropdown above to validate company information via Companies House API.
                    </p>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Delivery Templates Tab */}
        <TabsContent value="delivery-templates" className="space-y-6">
          <DeliveryTemplatesManager />
        </TabsContent>
      </Tabs>

      {/* Create Sender Profile Dialog */}
      <Dialog open={createProfileDialogOpen} onOpenChange={setCreateProfileDialogOpen}>
        <DialogContent data-testid="dialog-create-sender-profile">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">Create Sender Profile</DialogTitle>
            <DialogDescription data-testid="text-dialog-description">
              Add a new email sender profile for campaigns
            </DialogDescription>
          </DialogHeader>
          <Form {...senderProfileForm}>
            <form onSubmit={senderProfileForm.handleSubmit((data) => createProfileMutation.mutate(data))} className="space-y-4">
              <FormField
                control={senderProfileForm.control}
                name="fromName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>From Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Acme Corp" data-testid="input-profile-from-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={senderProfileForm.control}
                name="fromEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>From Email</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="marketing@acme.com" data-testid="input-profile-from-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={senderProfileForm.control}
                name="replyToEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Reply-To Email (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} type="email" placeholder="support@acme.com" data-testid="input-profile-reply-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={createProfileMutation.isPending} data-testid="button-submit-sender-profile">
                  {createProfileMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Profile
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Create Email Template Dialog */}
      <Dialog open={createTemplateDialogOpen} onOpenChange={setCreateTemplateDialogOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-create-email-template">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">Create Email Template</DialogTitle>
            <DialogDescription data-testid="text-dialog-description">
              Create a new email template for campaigns
            </DialogDescription>
          </DialogHeader>
          <Form {...emailTemplateForm}>
            <form onSubmit={emailTemplateForm.handleSubmit((data) => createTemplateMutation.mutate(data))} className="space-y-4">
              <FormField
                control={emailTemplateForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Template Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Welcome Email" data-testid="input-template-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={emailTemplateForm.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email Subject</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Welcome to {{company_name}}" data-testid="input-template-subject" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={emailTemplateForm.control}
                name="htmlContent"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>HTML Content</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="<html>...</html>" rows={10} data-testid="textarea-template-content" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={createTemplateMutation.isPending} data-testid="button-submit-email-template">
                  {createTemplateMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Template
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Create Call Script Dialog */}
      <Dialog open={createScriptDialogOpen} onOpenChange={setCreateScriptDialogOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-create-call-script">
          <DialogHeader>
            <DialogTitle data-testid="text-dialog-title">Create Call Script</DialogTitle>
            <DialogDescription data-testid="text-dialog-description">
              Create a new call script for telemarketing campaigns
            </DialogDescription>
          </DialogHeader>
          <Form {...callScriptForm}>
            <form onSubmit={callScriptForm.handleSubmit((data) => createScriptMutation.mutate(data))} className="space-y-4">
              <FormField
                control={callScriptForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Script Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Discovery Call Script" data-testid="input-script-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={callScriptForm.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Script Content</FormLabel>
                    <FormControl>
                      <Textarea {...field} placeholder="Hi {{contact_name}}, this is {{agent_name}} from..." rows={10} data-testid="textarea-script-content" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="submit" disabled={createScriptMutation.isPending} data-testid="button-submit-call-script">
                  {createScriptMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Create Script
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
