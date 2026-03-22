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
import { Switch } from "@/components/ui/switch";
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

function DeliveryTemplatesManager() {
  return (
    
      
        Delivery templates configuration is coming soon.
      
    
  );
}

export default function CampaignConfigPage() {
  const [activeTab, setActiveTab] = useState("sender-profiles");
  const [createProfileDialogOpen, setCreateProfileDialogOpen] = useState(false);
  const [createTemplateDialogOpen, setCreateTemplateDialogOpen] = useState(false);
  const [createScriptDialogOpen, setCreateScriptDialogOpen] = useState(false);
  const [selectedCampaignForValidation, setSelectedCampaignForValidation] = useState("");
  const { toast} = useToast();

  // Sender Profiles
  const { data: senderProfiles, isLoading: profilesLoading } = useQuery({
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
  const { data: emailTemplates, isLoading: templatesLoading } = useQuery({
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
  const { data: callScripts, isLoading: scriptsLoading } = useQuery({
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
  const { data: campaigns, isLoading: campaignsLoading } = useQuery({
    queryKey: ['/api/campaigns'],
  });

  const { data: validationSummary, isLoading: summaryLoading } = useQuery({
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
    
      
        
          Campaign Configuration
          
            Manage sender profiles, email templates, and call scripts
          
        
      

      
        
          
            
            Sender Profiles
          
          
            
            Email Templates
          
          
            
            Call Scripts
          
          
            
            Companies House
          
          
            
            Delivery Templates
          
        

        {/* Sender Profiles Tab */}
        
          
             setCreateProfileDialogOpen(true)} data-testid="button-create-sender-profile">
              
              Create Sender Profile
            
          

          {profilesLoading ? (
            
              {[1, 2, 3].map((i) => (
                
                  
                    
                  
                  
                    
                    
                  
                
              ))}
            
          ) : (
            
              {senderProfiles?.map((profile) => (
                
                  
                    
                      
                        {profile.fromName}
                      
                      
                        {profile.isActive ? "Active" : "Inactive"}
                      
                    
                  
                  
                    
                      From:
                      
                        {profile.fromName} &lt;{profile.fromEmail}&gt;
                      
                    
                    {profile.replyToEmail && (
                      
                        Reply-To:
                        {profile.replyToEmail}
                      
                    )}
                    
                       deleteProfileMutation.mutate(profile.id)}
                        disabled={deleteProfileMutation.isPending}
                        data-testid={`button-delete-profile-${profile.id}`}
                      >
                        
                      
                    
                  
                
              ))}
            
          )}
        

        {/* Email Templates Tab */}
        
          
             setCreateTemplateDialogOpen(true)} data-testid="button-create-email-template">
              
              Create Email Template
            
          

          {templatesLoading ? (
            
              {[1, 2].map((i) => (
                
                  
                    
                  
                  
                    
                    
                  
                
              ))}
            
          ) : (
            
              {emailTemplates?.map((template) => (
                
                  
                    
                      
                        {template.name}
                      
                      
                        {template.isApproved ? "Approved" : "Draft"}
                      
                    
                  
                  
                    
                      Subject:
                      {template.subject}
                    
                    
                      Version:
                      {template.version}
                    
                    
                      {!template.isApproved && (
                         approveTemplateMutation.mutate(template.id)}
                          disabled={approveTemplateMutation.isPending}
                          data-testid={`button-approve-template-${template.id}`}
                        >
                          
                          Approve
                        
                      )}
                       deleteTemplateMutation.mutate(template.id)}
                        disabled={deleteTemplateMutation.isPending}
                        data-testid={`button-delete-template-${template.id}`}
                      >
                        
                      
                    
                  
                
              ))}
            
          )}
        

        {/* Call Scripts Tab */}
        
          
             setCreateScriptDialogOpen(true)} data-testid="button-create-call-script">
              
              Create Call Script
            
          

          {scriptsLoading ? (
            
              {[1, 2].map((i) => (
                
                  
                    
                  
                  
                    
                  
                
              ))}
            
          ) : (
            
              {callScripts?.map((script) => (
                
                  
                    
                      
                        {script.name}
                      
                      
                        v{script.version}
                      
                    
                  
                  
                    
                      Content Preview:
                      
                        {script.content}
                      
                    
                    
                       deleteScriptMutation.mutate(script.id)}
                        disabled={deleteScriptMutation.isPending}
                        data-testid={`button-delete-script-${script.id}`}
                      >
                        
                      
                    
                  
                
              ))}
            
          )}
        

        {/* Companies House Validation Tab */}
        
          {/* Automation Settings Card */}
          
            
              
                
                Automation Settings
              
              
                Configure automatic validation when new leads are created
              
            
            
              
                
                  Select Campaign
                  
                    
                      
                    
                    
                      {campaigns?.map((campaign: any) => (
                        
                          {campaign.name}
                        
                      ))}
                    
                  
                
              

              {selectedCampaignForValidation && (
                
                  
                    
                      
                        Auto-validate on Lead Creation
                        
                          Automatically validate companies when new leads are created for this campaign
                        
                      
                       c.id === selectedCampaignForValidation)?.companiesHouseValidation?.enabled &&
                          campaigns?.find((c: any) => c.id === selectedCampaignForValidation)?.companiesHouseValidation?.autoValidateOnLeadCreation
                        }
                        onCheckedChange={async (checked: boolean) => {
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
                    
                    
                      
                        
                        How it works:
                      
                      
                        When enabled, newly created leads will be automatically validated in the background
                        Company name suffixes (Ltd, Limited, Inc, LLC, etc.) are automatically normalized
                        Validation results appear in the lead's QA data within seconds
                        Rate limits: ~1.2s per lead to comply with Companies House API limits
                      
                    
                  
                
              )}
            
          

          {/* Bulk Validation Card */}
          
            
              
                
                Bulk Validation
              
              
                Validate all existing leads for a campaign via Companies House API.
                This will check company status (must be Active), retrieve legal names, and registration numbers.
              
            
            
              
                
                  Select Campaign
                  
                    
                      
                    
                    
                      {campaigns?.map((campaign: any) => (
                        
                          {campaign.name}
                        
                      ))}
                    
                  
                
                 validateCompaniesMutation.mutate(selectedCampaignForValidation)}
                  disabled={!selectedCampaignForValidation || validateCompaniesMutation.isPending}
                  data-testid="button-validate-companies"
                >
                  {validateCompaniesMutation.isPending ? (
                    <>
                      
                      Starting...
                    
                  ) : (
                    <>
                      
                      Validate Companies
                    
                  )}
                
                 {
                    queryClient.invalidateQueries({ 
                      queryKey: ['/api/campaigns', selectedCampaignForValidation, 'validation-summary'],
                      refetchType: 'active'
                    });
                  }}
                  disabled={!selectedCampaignForValidation}
                  data-testid="button-refresh-summary"
                >
                  Refresh
                
              

              {selectedCampaignForValidation && (
                <>
                  {summaryLoading ? (
                    
                      {[1, 2, 3, 4, 5].map((i) => (
                        
                          
                            
                            
                          
                        
                      ))}
                    
                  ) : validationSummary ? (
                    
                      
                        
                        
                          Validation results for campaign leads. Note: Processing takes ~60-72 seconds per lead due to API rate limits (1.2s delay × 2 API calls per lead).
                        
                      
                      
                        
                          
                            {validationSummary.total}
                            Total Leads
                          
                        
                        
                          
                            
                              {validationSummary.validated}
                            
                            Validated
                          
                        
                        
                          
                            
                              {validationSummary.active}
                              
                            
                            Active
                          
                        
                        
                          
                            
                              {validationSummary.inactive}
                              
                            
                            Inactive
                          
                        
                        
                          
                            
                              {validationSummary.pending}
                              
                            
                            Pending
                          
                        
                        
                          
                            
                              {validationSummary.apiErrors || 0}
                              
                            
                            API Errors
                          
                        
                      

                      {validationSummary.notFound > 0 && (
                        
                          
                            
                              
                              
                                Companies Not Found
                                
                                  {validationSummary.notFound} companies could not be found in Companies House registry
                                
                              
                            
                          
                        
                      )}

                      {validationSummary.apiErrors > 0 && (
                        
                          
                            
                              
                              
                                API Errors Encountered
                                
                                  {validationSummary.apiErrors} validation requests failed due to API errors (network issues, rate limits, or service unavailability)
                                
                              
                            
                          
                        
                      )}

                      
                        
                          
                            Validation Data Stored: Each lead's QA data now includes:
                            • Company House Status (Active/Inactive)
                            • Company House Legal Name
                            • Company House Registration Number
                            • Registered Address
                            • Date of Creation
                          
                          
                            View individual lead details in the Leads page to see complete validation data.
                          
                        
                      
                    
                  ) : (
                    
                      
                        No validation data available for this campaign yet.
                        Click "Validate Companies" to start the validation process.
                      
                    
                  )}
                
              )}

              {!selectedCampaignForValidation && (
                
                  
                    
                    Select a campaign to begin validation
                    
                      Choose a campaign from the dropdown above to validate company information via Companies House API.
                    
                  
                
              )}
            
          
        

        {/* Delivery Templates Tab */}
        
          
        
      

      {/* Create Sender Profile Dialog */}
      
        
          
            Create Sender Profile
            
              Add a new email sender profile for campaigns
            
          
          
             createProfileMutation.mutate(data))} className="space-y-4">
               (
                  
                    From Name
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    From Email
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    Reply-To Email (Optional)
                    
                      
                    
                    
                  
                )}
              />
              
                
                  {createProfileMutation.isPending && }
                  Create Profile
                
              
            
          
        
      

      {/* Create Email Template Dialog */}
      
        
          
            Create Email Template
            
              Create a new email template for campaigns
            
          
          
             createTemplateMutation.mutate(data))} className="space-y-4">
               (
                  
                    Template Name
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    Email Subject
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    HTML Content
                    
                      ..." rows={10} data-testid="textarea-template-content" />
                    
                    
                  
                )}
              />
              
                
                  {createTemplateMutation.isPending && }
                  Create Template
                
              
            
          
        
      

      {/* Create Call Script Dialog */}
      
        
          
            Create Call Script
            
              Create a new call script for telemarketing campaigns
            
          
          
             createScriptMutation.mutate(data))} className="space-y-4">
               (
                  
                    Script Name
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    Script Content
                    
                      
                    
                    
                  
                )}
              />
              
                
                  {createScriptMutation.isPending && }
                  Create Script
                
              
            
          
        
      
    
  );
}