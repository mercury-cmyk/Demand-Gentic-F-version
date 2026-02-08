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
import { Phone, Plus, Trash2, Star, Settings, Download, PhoneCall, Globe, Server, RefreshCw, CheckCircle2, AlertCircle, Copy } from "lucide-react";
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

type FormData = z.infer<typeof formSchema>;

export default function TelephonySettingsPage() {
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<SipTrunkConfig | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

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
  const { data: configs = [], isLoading } = useQuery<SipTrunkConfig[]>({
    queryKey: ['/api/sip-trunks'],
  });

  const form = useForm<FormData>({
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
    <SettingsLayout
      title="Telephony"
      description="Configure your calling settings and SIP trunk connections"
    >
      <div className="space-y-6">
        {/* Agent Callback Phone Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PhoneCall className="h-5 w-5" />
              Click-to-Call Settings
            </CardTitle>
            <CardDescription>
              Configure your callback phone for human-initiated calls from the Agent Console.
              When you click "Call Now", the system will first call your phone, then connect you to the prospect.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingTelephony ? (
              <div className="text-center py-4 text-muted-foreground">
                Loading settings...
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label htmlFor="callback-phone" className="text-sm font-medium">
                    Callback Phone Number
                  </label>
                  <Input
                    id="callback-phone"
                    type="tel"
                    placeholder="+1 (555) 123-4567"
                    value={callbackPhone}
                    onChange={(e) => setCallbackPhone(e.target.value)}
                    className="max-w-md font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter your phone number in E.164 format (e.g., +14155551234). This is the phone that will ring when you initiate a call.
                  </p>
                </div>

                <div className="space-y-2">
                  <label htmlFor="sip-extension" className="text-sm font-medium">
                    SIP Extension (Optional)
                  </label>
                  <Input
                    id="sip-extension"
                    type="text"
                    placeholder="1001"
                    value={sipExtension}
                    onChange={(e) => setSipExtension(e.target.value)}
                    className="max-w-md font-mono"
                  />
                  <p className="text-xs text-muted-foreground">
                    If using WebRTC softphone, enter your SIP extension here.
                  </p>
                </div>

                <Button
                  onClick={handleSaveTelephonySettings}
                  disabled={isSavingTelephony}
                  className="mt-2"
                >
                  {isSavingTelephony ? 'Saving...' : 'Save Settings'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Telnyx Webhook Management */}
        <TelnyxWebhookManagement />

        {/* SIP Trunk Section Header */}
        <div className="pt-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Phone className="h-5 w-5" />
            SIP Trunk Configuration
          </h3>
          <p className="text-sm text-muted-foreground">
            Configure SIP trunk connections for WebRTC calling (Admin only)
          </p>
        </div>

        {/* Actions */}
        <div className="flex justify-between items-center">
          <div className="flex gap-2">
            <Button onClick={handleNew} data-testid="button-add-sip-trunk">
              <Plus className="mr-2 h-4 w-4" />
              Add SIP Trunk
            </Button>
            <Button
              variant="outline"
              onClick={() => importEnvMutation.mutate()}
              disabled={importEnvMutation.isPending}
            >
              <Download className="mr-2 h-4 w-4" />
              Import from Environment
            </Button>
          </div>
        </div>

        {/* SIP Trunk List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" />
              SIP Trunk Configurations
            </CardTitle>
            <CardDescription>
              Manage your SIP trunk connections for WebRTC calling
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading configurations...
              </div>
            ) : configs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Phone className="mx-auto h-12 w-12 mb-4 opacity-50" />
                <p>No SIP trunk configurations found.</p>
                <p className="text-sm">Add a configuration or import from environment variables.</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Caller ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[150px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {configs.map((config) => (
                    <TableRow key={config.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {config.name}
                          {config.isDefault && (
                            <Badge variant="secondary">
                              <Star className="h-3 w-3 mr-1" />
                              Default
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{config.provider}</TableCell>
                      <TableCell className="font-mono text-sm">
                        {config.sipDomain || '-'}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {config.callerIdNumber || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={config.isActive ?? true}
                            onCheckedChange={(checked) =>
                              toggleActiveMutation.mutate({ id: config.id, isActive: checked })
                            }
                          />
                          <span className={config.isActive ? 'text-green-600' : 'text-muted-foreground'}>
                            {config.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(config)}
                          >
                            <Settings className="h-4 w-4" />
                          </Button>
                          {!config.isDefault && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDefaultMutation.mutate(config.id)}
                              title="Set as default"
                            >
                              <Star className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteConfirmId(config.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card>
          <CardHeader>
            <CardTitle>Supported Providers</CardTitle>
            <CardDescription>
              Compatible SIP trunk providers for voice calling
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {['Telnyx', 'Twilio', 'Bandwidth', 'Plivo', 'Vonage', 'SignalWire', 'Flowroute', 'Skyetel'].map(provider => (
                <div key={provider} className="p-3 border rounded-lg text-center">
                  <span className="font-medium">{provider}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingConfig ? 'Edit SIP Trunk' : 'Add SIP Trunk'}
            </DialogTitle>
            <DialogDescription>
              Configure your SIP trunk connection details
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="My SIP Trunk" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provider</FormLabel>
                    <FormControl>
                      <Input placeholder="telnyx" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sipUsername"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SIP Username</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sipPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SIP Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sipDomain"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SIP Domain</FormLabel>
                    <FormControl>
                      <Input placeholder="sip.telnyx.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="connectionId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Connection ID (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription>
                      Provider-specific connection identifier
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="callerIdNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Caller ID Number (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="+1234567890" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  {saveMutation.isPending ? 'Saving...' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={() => setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SIP Trunk Configuration?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the SIP trunk configuration.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsLayout>
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
  const { data: webhookData, isLoading, refetch } = useQuery<TelnyxWebhookData>({
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
        title: 'Switched to Development',
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
        title: 'Switched to Production',
        description: successApps.length > 0
          ? `Updated: ${successApps.join(', ')} → ${data.config?.baseUrl}`
          : `Webhooks now pointing to: ${data.config?.baseUrl}`,
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Telnyx Webhook Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />
            Loading webhook configuration...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!webhookData?.success) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Telnyx Webhook Configuration
          </CardTitle>
          <CardDescription>
            Manage your Telnyx TeXML application webhook URLs
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 p-4 bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg">
            <AlertCircle className="h-5 w-5 text-yellow-600" />
            <div>
              <p className="font-medium text-yellow-800 dark:text-yellow-200">Configuration Required</p>
              <p className="text-sm text-yellow-700 dark:text-yellow-300">
                {webhookData?.message || 'Please ensure TELNYX_API_KEY and TELNYX_TEXML_APP_ID are set in your environment.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Telnyx Webhook Configuration
            </CardTitle>
            <CardDescription>
              Switch between development (ngrok) and production webhook URLs for AI calls
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Apps Info - TeXML and Call Control */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* TeXML Application */}
          <div className="p-3 bg-muted/50 rounded-lg border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Phone className="h-4 w-4" />
                TeXML Application
              </p>
              <Badge variant={webhookData.currentConfig?.active ? 'default' : 'secondary'} className="text-xs">
                {webhookData.currentConfig?.active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate">{webhookData.appName || webhookData.texmlAppId || 'Not configured'}</p>
            <div className="mt-2 text-xs">
              <p className="text-muted-foreground truncate">Voice: {webhookData.currentConfig?.voiceUrl || 'Not set'}</p>
            </div>
          </div>

          {/* Call Control Application */}
          <div className="p-3 bg-muted/50 rounded-lg border">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <PhoneCall className="h-4 w-4" />
                Call Control Application
              </p>
              <Badge variant={webhookData.callControlConfig?.active ? 'default' : 'secondary'} className="text-xs">
                {webhookData.callControlConfig?.active ? 'Active' : webhookData.callControlAppId ? 'Inactive' : 'N/A'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground font-mono truncate">{webhookData.callControlAppName || webhookData.callControlAppId || 'Not configured'}</p>
            <div className="mt-2 text-xs">
              <p className="text-muted-foreground truncate">Webhook: {webhookData.callControlConfig?.webhookUrl || 'Not set'}</p>
            </div>
          </div>
        </div>

        {/* Current Configuration */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Current Webhook URLs</h4>

          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 bg-muted/30 rounded border">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">TeXML Voice URL</p>
                <p className="text-sm font-mono truncate">{webhookData.currentConfig?.voiceUrl || 'Not set'}</p>
              </div>
              {webhookData.currentConfig?.voiceUrl && (
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(webhookData.currentConfig!.voiceUrl)}>
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between p-2 bg-muted/30 rounded border">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">TeXML Status Callback</p>
                <p className="text-sm font-mono truncate">{webhookData.currentConfig?.statusCallbackUrl || 'Not set'}</p>
              </div>
              {webhookData.currentConfig?.statusCallbackUrl && (
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(webhookData.currentConfig!.statusCallbackUrl!)}>
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between p-2 bg-muted/30 rounded border">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">Call Control Webhook</p>
                <p className="text-sm font-mono truncate">{webhookData.callControlConfig?.webhookUrl || 'Not set'}</p>
              </div>
              {webhookData.callControlConfig?.webhookUrl && (
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(webhookData.callControlConfig!.webhookUrl)}>
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>

            <div className="flex items-center justify-between p-2 bg-muted/30 rounded border">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">WebSocket URL (Voice Dialer)</p>
                <p className="text-sm font-mono truncate">{webhookData.environment?.websocketUrl || 'Not set'}</p>
              </div>
              {webhookData.environment?.websocketUrl && (
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(webhookData.environment!.websocketUrl)}>
                  <Copy className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Current Mode Indicator */}
          <div className="flex items-center gap-2 mt-2">
            {isPointingToDev ? (
              <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                <Server className="h-3 w-3 mr-1" />
                Development Mode (ngrok)
              </Badge>
            ) : isPointingToProd ? (
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Production Mode
              </Badge>
            ) : (
              <Badge variant="outline">
                <AlertCircle className="h-3 w-3 mr-1" />
                Custom Configuration
              </Badge>
            )}
          </div>
        </div>

        {/* Quick Switch Buttons */}
        <div className="space-y-3">
          <h4 className="text-sm font-semibold">Quick Switch</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Button
                variant={isPointingToDev ? 'default' : 'outline'}
                className="w-full"
                onClick={() => switchToDevMutation.mutate(undefined)}
                disabled={switchToDevMutation.isPending}
              >
                <Server className="h-4 w-4 mr-2" />
                {switchToDevMutation.isPending ? 'Switching...' : 'Switch to Dev (ngrok)'}
              </Button>
              {webhookData.environment?.ngrokUrl && (
                <p className="text-xs text-muted-foreground text-center truncate">
                  {webhookData.environment.ngrokUrl}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Button
                variant={isPointingToProd ? 'default' : 'outline'}
                className="w-full"
                onClick={() => switchToProdMutation.mutate(undefined)}
                disabled={switchToProdMutation.isPending}
              >
                <Globe className="h-4 w-4 mr-2" />
                {switchToProdMutation.isPending ? 'Switching...' : 'Switch to Production'}
              </Button>
              {webhookData.environment?.productionUrl && (
                <p className="text-xs text-muted-foreground text-center truncate">
                  {webhookData.environment.productionUrl}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Custom URL Input */}
        <div className="space-y-3 pt-3 border-t">
          <h4 className="text-sm font-semibold">Custom URLs</h4>
          <div className="space-y-2">
            <div>
              <label className="text-xs text-muted-foreground">Custom ngrok URL</label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://abc123.ngrok.io"
                  value={customNgrokUrl}
                  onChange={(e) => setCustomNgrokUrl(e.target.value)}
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  onClick={() => switchToDevMutation.mutate(customNgrokUrl)}
                  disabled={!customNgrokUrl || switchToDevMutation.isPending}
                >
                  Apply
                </Button>
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Custom Production URL</label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://api.yourdomain.com"
                  value={customProdUrl}
                  onChange={(e) => setCustomProdUrl(e.target.value)}
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  onClick={() => switchToProdMutation.mutate(customProdUrl)}
                  disabled={!customProdUrl || switchToProdMutation.isPending}
                >
                  Apply
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Last Updated */}
        {webhookData.updatedAt && (
          <p className="text-xs text-muted-foreground text-right">
            Last updated: {new Date(webhookData.updatedAt).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
