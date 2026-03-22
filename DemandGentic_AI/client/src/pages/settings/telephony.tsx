/**
 * Telephony Settings Page
 *
 * SIP trunk configuration within the Settings Hub.
 * This page wraps the existing SIP trunk settings functionality.
 */

import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertSipTrunkConfigSchema } from "@shared/schema";
import { z } from "zod";
import { Phone, PhoneOff, Plus, Trash2, Star, Settings, Download, PhoneCall, Globe, Server, RefreshCw, CheckCircle2, AlertCircle, Copy } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SettingsLayout } from "@/components/settings/settings-layout";

type SipTrunkConfig = {
  id: string;
  name: string;
  provider: string;
  sipUsername: string;
  sipPassword: string;
  sipDomain?: string;
  connectionId?: string;
  callerIdNumber?: string;
  isDefault: boolean | null;
  isActive: boolean | null;
  createdAt: Date;
};

const formSchema = insertSipTrunkConfigSchema.extend({
  id: z.string().optional(),
  sipDomain: z
    .string()
    .trim()
    .min(1, "SIP domain is required")
    .refine(
      (value) => !value.includes("://") && !value.includes("/") && value.includes("."),
      "Enter a valid SIP domain (FQDN), e.g. sip.telnyx.com"
    ),
});

type FormData = z.infer;

export default function TelephonySettingsPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Agent callback phone state
  const [callbackPhone, setCallbackPhone] = useState('');
  const [sipExtension, setSipExtension] = useState('');
  const [isLoadingTelephony, setIsLoadingTelephony] = useState(true);
  const [isSavingTelephony, setIsSavingTelephony] = useState(false);

  // Fetch user's telephony settings
  useEffect(() => {
    const loadTelephonySettings = async () => {
      try {
        const response = await apiRequest('GET', '/api/users/me/telephony');
        const data = await response.json();
        setCallbackPhone(data.callbackPhone || '');
        setSipExtension(data.sipExtension || '');
      } catch (error) {
        console.error('Failed to load telephony settings:', error);
      } finally {
        setIsLoadingTelephony(false);
      }
    };
    loadTelephonySettings();
  }, []);

  // Save callback phone settings
  const handleSaveTelephonySettings = async () => {
    setIsSavingTelephony(true);
    try {
      const response = await apiRequest('PUT', '/api/users/me/telephony', {
        callbackPhone: callbackPhone.trim() || null,
        sipExtension: sipExtension.trim() || null,
      });
      const data = await response.json();

      if (data.success) {
        toast({
          title: 'Settings Saved',
          description: 'Your telephony settings have been updated.',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Save Failed',
        description: error.message || 'Failed to save telephony settings',
        variant: 'destructive',
      });
    } finally {
      setIsSavingTelephony(false);
    }
  };

  // Fetch all SIP trunk configs
  const { data: configs = [], isLoading } = useQuery({
    queryKey: ['/api/sip-trunks'],
  });

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      provider: "telnyx",
      sipUsername: "",
      sipPassword: "",
      sipDomain: "sip.telnyx.com",
      connectionId: "",
      callerIdNumber: "",
      isActive: true,
      isDefault: false,
    },
  });

  const providerValue = form.watch("provider");
  const sipDomainValue = form.watch("sipDomain");
  const isTelnyx = providerValue?.trim().toLowerCase() === "telnyx";

  useEffect(() => {
    if (!isTelnyx) return;
    if (!sipDomainValue || sipDomainValue === "sip.provider.com") {
      form.setValue("sipDomain", "sip.telnyx.com");
    }
  }, [form, isTelnyx, sipDomainValue]);

  // Create/Update mutation
  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (editingConfig) {
        return apiRequest('PATCH', `/api/sip-trunks/${editingConfig.id}`, data);
      } else {
        return apiRequest('POST', '/api/sip-trunks', data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sip-trunks'] });
      toast({
        title: editingConfig ? "Configuration updated" : "Configuration created",
        description: `SIP trunk configuration has been ${editingConfig ? 'updated' : 'created'} successfully.`,
      });
      setIsDialogOpen(false);
      setEditingConfig(null);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save SIP trunk configuration",
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/sip-trunks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sip-trunks'] });
      toast({
        title: "Configuration deleted",
        description: "SIP trunk configuration has been deleted successfully.",
      });
      setDeleteConfirmId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete SIP trunk configuration",
        variant: "destructive",
      });
    },
  });

  // Set default mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('POST', `/api/sip-trunks/${id}/set-default`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sip-trunks'] });
      toast({
        title: "Default trunk set",
        description: "This SIP trunk is now the default for all agents.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to set default SIP trunk",
        variant: "destructive",
      });
    },
  });

  // Toggle active status mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      return apiRequest('PATCH', `/api/sip-trunks/${id}`, { isActive });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sip-trunks'] });
      toast({
        title: "Status updated",
        description: "SIP trunk status has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update SIP trunk status",
        variant: "destructive",
      });
    },
  });

  // Import from environment mutation
  const importEnvMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/sip-trunks/import-env');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/sip-trunks'] });
      toast({
        title: "Import successful",
        description: "SIP trunk configuration imported from environment variables.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import failed",
        description: error.message || "Failed to import from environment",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (config: SipTrunkConfig) => {
    setEditingConfig(config);
    form.reset({
      name: config.name,
      provider: config.provider,
      sipUsername: config.sipUsername,
      sipPassword: config.sipPassword,
      sipDomain: config.sipDomain || "sip.telnyx.com",
      connectionId: config.connectionId || "",
      callerIdNumber: config.callerIdNumber || "",
      isActive: config.isActive ?? true,
      isDefault: config.isDefault ?? false,
    });
    setIsDialogOpen(true);
  };

  const handleNew = () => {
    setEditingConfig(null);
    form.reset({
      name: "",
      provider: "telnyx",
      sipUsername: "",
      sipPassword: "",
      sipDomain: "sip.telnyx.com",
      connectionId: "",
      callerIdNumber: "",
      isActive: true,
      isDefault: false,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: FormData) => {
    saveMutation.mutate(data);
  };

  return (
    
      
        {/* Agent Callback Phone Settings */}
        
          
            
              
              Click-to-Call Settings
            
            
              Configure your callback phone for human-initiated calls from the Agent Console.
              When you click "Call Now", the system will first call your phone, then connect you to the prospect.
            
          
          
            {isLoadingTelephony ? (
              
                Loading settings...
              
            ) : (
              <>
                
                  
                    Callback Phone Number
                  
                   setCallbackPhone(e.target.value)}
                    className="max-w-md font-mono"
                  />
                  
                    Enter your phone number in E.164 format (e.g., +14155551234). This is the phone that will ring when you initiate a call.
                  
                

                
                  
                    SIP Extension (Optional)
                  
                   setSipExtension(e.target.value)}
                    className="max-w-md font-mono"
                  />
                  
                    If using WebRTC softphone, enter your SIP extension here.
                  
                

                
                  {isSavingTelephony ? 'Saving...' : 'Save Settings'}
                
              
            )}
          
        

        {/* Telnyx Webhook Management */}
        

        {/* SIP Trunk Section Header */}
        
          
            
            SIP Trunk Configuration
          
          
            Configure SIP trunk connections for WebRTC calling (Admin only)
          
        

        {/* Actions */}
        
          
            
              
              Add SIP Trunk
            
             importEnvMutation.mutate()}
              disabled={importEnvMutation.isPending}
            >
              
              Import from Environment
            
          
        

        {/* SIP Trunk List */}
        
          
            
              
              SIP Trunk Configurations
            
            
              Manage your SIP trunk connections for WebRTC calling
            
          
          
            {isLoading ? (
              
                Loading configurations...
              
            ) : configs.length === 0 ? (
              
                
                No SIP trunk configurations found.
                Add a configuration or import from environment variables.
              
            ) : (
              
                
                  
                    Name
                    Provider
                    Domain
                    Caller ID
                    Status
                    Actions
                  
                
                
                  {configs.map((config) => (
                    
                      
                        
                          {config.name}
                          {config.isDefault && (
                            
                              
                              Default
                            
                          )}
                        
                      
                      {config.provider}
                      
                        {config.sipDomain || '-'}
                      
                      
                        {config.callerIdNumber || '-'}
                      
                      
                        
                          
                              toggleActiveMutation.mutate({ id: config.id, isActive: checked })
                            }
                          />
                          
                            {config.isActive ? 'Active' : 'Inactive'}
                          
                        
                      
                      
                        
                           handleEdit(config)}
                          >
                            
                          
                          {!config.isDefault && (
                             setDefaultMutation.mutate(config.id)}
                              title="Set as default"
                            >
                              
                            
                          )}
                           setDeleteConfirmId(config.id)}
                          >
                            
                          
                        
                      
                    
                  ))}
                
              
            )}
          
        

        {/* Info Card */}
        
          
            Supported Providers
            
              Compatible SIP trunk providers for voice calling
            
          
          
            
              {['Telnyx', 'Twilio', 'Bandwidth', 'Plivo', 'Vonage', 'SignalWire', 'Flowroute', 'Skyetel'].map(provider => (
                
                  {provider}
                
              ))}
            
          
        
      

      {/* Add/Edit Dialog */}
      
        
          
            
              {editingConfig ? 'Edit SIP Trunk' : 'Add SIP Trunk'}
            
            
              Configure your SIP trunk connection details
            
          
          
            
               (
                  
                    Name
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    Provider
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    SIP Username
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    SIP Password
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    SIP Domain
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    Connection ID (Optional)
                    
                      
                    
                    
                      Provider-specific connection identifier
                    
                    
                  
                )}
              />
               (
                  
                    Caller ID Number (Optional)
                    
                      
                    
                    
                  
                )}
              />
              
                 setIsDialogOpen(false)}>
                  Cancel
                
                
                  {saveMutation.isPending ? 'Saving...' : 'Save'}
                
              
            
          
        
      

      {/* Delete Confirmation Dialog */}
       setDeleteConfirmId(null)}>
        
          
            Delete SIP Trunk Configuration?
            
              This action cannot be undone. This will permanently delete the SIP trunk configuration.
            
          
          
            Cancel
             deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            
          
        
      
    
  );
}

// ==================== TELNYX WEBHOOK MANAGEMENT COMPONENT ====================

interface WebhookConfig {
  voiceUrl: string;
  voiceFallbackUrl?: string;
  statusCallbackUrl?: string;
  voiceMethod?: string;
  statusCallbackMethod?: string;
  active?: boolean;
  inbound?: boolean;
  outbound?: boolean;
}

interface CallControlConfig {
  webhookUrl: string;
  webhookFailoverUrl?: string;
  active?: boolean;
}

interface AppInfo {
  id: string;
  name: string;
  voiceUrl?: string;
  statusCallbackUrl?: string;
  webhookUrl?: string;
  active: boolean;
  isCurrent: boolean;
}

interface TelnyxWebhookData {
  success: boolean;
  texmlAppId?: string;
  appName?: string;
  currentConfig?: WebhookConfig;
  callControlAppId?: string;
  callControlAppName?: string;
  callControlConfig?: CallControlConfig;
  allTexmlApps?: AppInfo[];
  allCallControlApps?: AppInfo[];
  environment?: {
    ngrokUrl: string;
    productionUrl: string;
    isDevMode: boolean;
    websocketUrl: string;
    callExecutionEnabled: boolean;
  };
  updatedAt?: string;
  message?: string;
  results?: {
    texml?: { success: boolean; name?: string; error?: string };
    callControl?: { success: boolean; name?: string; error?: string };
  };
}

function TelnyxWebhookManagement() {
  const { toast } = useToast();
  const [customNgrokUrl, setCustomNgrokUrl] = useState('');
  const [customProdUrl, setCustomProdUrl] = useState('');
  const [isCustomDialogOpen, setIsCustomDialogOpen] = useState(false);

  // Fetch current webhook configuration
  const { data: webhookData, isLoading, refetch } = useQuery({
    queryKey: ['/api/telnyx/webhook-config'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/telnyx/webhook-config');
      return res.json();
    },
    retry: false,
  });

  // Switch to dev mutation
  const switchToDevMutation = useMutation({
    mutationFn: async (ngrokUrl?: string) => {
      const res = await apiRequest('POST', '/api/telnyx/webhook-config/switch-to-dev', {
        ngrokUrl: ngrokUrl || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/telnyx/webhook-config'] });
      const results = data.results || {};
      const successApps = [
        results.texml?.success && results.texml.name,
        results.callControl?.success && results.callControl.name,
      ].filter(Boolean);
      toast({
        title: 'Switched to Development — Calls Enabled',
        description: successApps.length > 0
          ? `Updated: ${successApps.join(', ')} → ${data.config?.baseUrl}`
          : `Webhooks now pointing to: ${data.config?.baseUrl}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Switch Failed',
        description: error.message || 'Failed to switch to dev URLs',
        variant: 'destructive',
      });
    },
  });

  // Switch to prod mutation
  const switchToProdMutation = useMutation({
    mutationFn: async (productionUrl?: string) => {
      const res = await apiRequest('POST', '/api/telnyx/webhook-config/switch-to-prod', {
        productionUrl: productionUrl || undefined,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/telnyx/webhook-config'] });
      const results = data.results || {};
      const successApps = [
        results.texml?.success && results.texml.name,
        results.callControl?.success && results.callControl.name,
      ].filter(Boolean);
      toast({
        title: 'Switched to Production — Calls Disabled',
        description: successApps.length > 0
          ? `Updated: ${successApps.join(', ')} → ${data.config?.baseUrl}. This server will not initiate calls.`
          : `Webhooks now pointing to: ${data.config?.baseUrl}. This server will not initiate calls.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Switch Failed',
        description: error.message || 'Failed to switch to production URLs',
        variant: 'destructive',
      });
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'URL copied to clipboard',
    });
  };

  // Determine if currently pointing to dev or prod
  const isPointingToDev = webhookData?.currentConfig?.voiceUrl?.includes('ngrok') ||
                          webhookData?.currentConfig?.voiceUrl?.includes('localhost');
  const isPointingToProd = webhookData?.currentConfig?.voiceUrl?.includes(webhookData?.environment?.productionUrl || 'demandgentic');

  if (isLoading) {
    return (
      
        
          
            
            Telnyx Webhook Configuration
          
        
        
          
            
            Loading webhook configuration...
          
        
      
    );
  }

  if (!webhookData?.success) {
    return (
      
        
          
            
            Telnyx Webhook Configuration
          
          
            Manage your Telnyx TeXML application webhook URLs
          
        
        
          
            
            
              Configuration Required
              
                {webhookData?.message || 'Please ensure TELNYX_API_KEY and TELNYX_TEXML_APP_ID are set in your environment.'}
              
            
          
        
      
    );
  }

  return (
    
      
        
          
            
              
              Telnyx Webhook Configuration
            
            
              Switch between development (ngrok) and production webhook URLs for AI calls
            
          
           refetch()}>
            
          
        
      
      
        {/* Apps Info - TeXML and Call Control */}
        
          {/* TeXML Application */}
          
            
              
                
                TeXML Application
              
              
                {webhookData.currentConfig?.active ? 'Active' : 'Inactive'}
              
            
            {webhookData.appName || webhookData.texmlAppId || 'Not configured'}
            
              Voice: {webhookData.currentConfig?.voiceUrl || 'Not set'}
            
          

          {/* Call Control Application */}
          
            
              
                
                Call Control Application
              
              
                {webhookData.callControlConfig?.active ? 'Active' : webhookData.callControlAppId ? 'Inactive' : 'N/A'}
              
            
            {webhookData.callControlAppName || webhookData.callControlAppId || 'Not configured'}
            
              Webhook: {webhookData.callControlConfig?.webhookUrl || 'Not set'}
            
          
        

        {/* Current Configuration */}
        
          Current Webhook URLs

          
            
              
                TeXML Voice URL
                {webhookData.currentConfig?.voiceUrl || 'Not set'}
              
              {webhookData.currentConfig?.voiceUrl && (
                 copyToClipboard(webhookData.currentConfig!.voiceUrl)}>
                  
                
              )}
            

            
              
                TeXML Status Callback
                {webhookData.currentConfig?.statusCallbackUrl || 'Not set'}
              
              {webhookData.currentConfig?.statusCallbackUrl && (
                 copyToClipboard(webhookData.currentConfig!.statusCallbackUrl!)}>
                  
                
              )}
            

            
              
                Call Control Webhook
                {webhookData.callControlConfig?.webhookUrl || 'Not set'}
              
              {webhookData.callControlConfig?.webhookUrl && (
                 copyToClipboard(webhookData.callControlConfig!.webhookUrl)}>
                  
                
              )}
            

            
              
                WebSocket URL (Voice Dialer)
                {webhookData.environment?.websocketUrl || 'Not set'}
              
              {webhookData.environment?.websocketUrl && (
                 copyToClipboard(webhookData.environment!.websocketUrl)}>
                  
                
              )}
            
          

          {/* Current Mode Indicator */}
          
            {isPointingToDev ? (
              
                
                Development Mode (ngrok)
              
            ) : isPointingToProd ? (
              
                
                Production Mode
              
            ) : (
              
                
                Custom Configuration
              
            )}
            {webhookData.environment?.callExecutionEnabled ? (
              
                
                Calls Enabled
              
            ) : webhookData.environment?.callExecutionEnabled === false ? (
              
                
                Calls Disabled
              
            ) : null}
          
        

        {/* Quick Switch Buttons */}
        
          Quick Switch
          
            
               switchToDevMutation.mutate(undefined)}
                disabled={switchToDevMutation.isPending}
              >
                
                {switchToDevMutation.isPending ? 'Switching...' : 'Switch to Dev (ngrok)'}
              
              {webhookData.environment?.ngrokUrl && (
                
                  {webhookData.environment.ngrokUrl}
                
              )}
            

            
               switchToProdMutation.mutate(undefined)}
                disabled={switchToProdMutation.isPending}
              >
                
                {switchToProdMutation.isPending ? 'Switching...' : 'Switch to Production'}
              
              {webhookData.environment?.productionUrl && (
                
                  {webhookData.environment.productionUrl}
                
              )}
            
          
        

        {/* Custom URL Input */}
        
          Custom URLs
          
            
              Custom ngrok URL
              
                 setCustomNgrokUrl(e.target.value)}
                  className="font-mono text-sm"
                />
                 switchToDevMutation.mutate(customNgrokUrl)}
                  disabled={!customNgrokUrl || switchToDevMutation.isPending}
                >
                  Apply
                
              
            

            
              Custom Production URL
              
                 setCustomProdUrl(e.target.value)}
                  className="font-mono text-sm"
                />
                 switchToProdMutation.mutate(customProdUrl)}
                  disabled={!customProdUrl || switchToProdMutation.isPending}
                >
                  Apply
                
              
            
          
        

        {/* Last Updated */}
        {webhookData.updatedAt && (
          
            Last updated: {new Date(webhookData.updatedAt).toLocaleString()}
          
        )}
      
    
  );
}