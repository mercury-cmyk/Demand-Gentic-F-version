import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Settings, User, Bell, Shield, Mail, Phone, Database, Plus, Pencil, Trash2, Play, Clock, Link as LinkIcon, CheckCircle2, AlertCircle, Globe, Loader2, RefreshCw, Cloud } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import type { CustomFieldDefinition } from "@shared/schema";
import { GoogleCloudAccountsTab } from "@/components/settings/google-cloud-accounts-tab";

type MfaSetup = {
  qrCode: string;
  secret: string;
  backupCodes: string[];
};

export default function SettingsPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mfaSetup, setMfaSetup] = useState(null);
  const [mfaConfirmCode, setMfaConfirmCode] = useState("");
  const [mfaDisablePassword, setMfaDisablePassword] = useState("");
  const [mfaDialogOpen, setMfaDialogOpen] = useState(false);
  const [mfaDisableDialogOpen, setMfaDisableDialogOpen] = useState(false);
  const [customFieldDialogOpen, setCustomFieldDialogOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const { toast } = useToast();

  // Custom Fields State
  const [fieldEntityType, setFieldEntityType] = useState("contact");
  const [fieldKey, setFieldKey] = useState("");
  const [displayLabel, setDisplayLabel] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [helpText, setHelpText] = useState("");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState("");

  const { data: customFields, isLoading: fieldsLoading } = useQuery({
    queryKey: ['/api/custom-fields'],
  });

  const { data: mfaStatus, isLoading: mfaStatusLoading } = useQuery({
    queryKey: ['/api/auth/mfa/status'],
  });

  const enrollMfaMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/auth/mfa/enroll');
      return response.json() as Promise;
    },
    onSuccess: (data) => {
      setMfaSetup(data);
      setMfaDialogOpen(true);
      toast({
        title: "Set up Google Authenticator",
        description: "Scan the QR code and enter the 6-digit code to confirm.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "2FA setup failed",
        description: error.message,
      });
    },
  });

  const confirmMfaMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/auth/mfa/confirm', { token: mfaConfirmCode.trim() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/mfa/status'] });
      setMfaDialogOpen(false);
      setMfaSetup(null);
      setMfaConfirmCode("");
      toast({
        title: "2FA enabled",
        description: "Google Authenticator is now required at login.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Verification failed",
        description: error.message,
      });
    },
  });

  const disableMfaMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/auth/mfa/disable', { password: mfaDisablePassword });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/mfa/status'] });
      setMfaDisableDialogOpen(false);
      setMfaDisablePassword("");
      toast({
        title: "2FA disabled",
        description: "Multi-factor authentication has been turned off.",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Disable failed",
        description: error.message,
      });
    },
  });

  const createFieldMutation = useMutation({
    mutationFn: async (data: any) => {
      await apiRequest('POST', '/api/custom-fields', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-fields'] });
      resetFieldForm();
      setCustomFieldDialogOpen(false);
      toast({
        title: "Success",
        description: "Custom field created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const updateFieldMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      await apiRequest('PATCH', `/api/custom-fields/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-fields'] });
      resetFieldForm();
      setCustomFieldDialogOpen(false);
      toast({
        title: "Success",
        description: "Custom field updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest('DELETE', `/api/custom-fields/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/custom-fields'] });
      toast({
        title: "Success",
        description: "Custom field deleted successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message,
      });
    },
  });

  const resetFieldForm = () => {
    setFieldEntityType("contact");
    setFieldKey("");
    setDisplayLabel("");
    setFieldType("text");
    setHelpText("");
    setRequired(false);
    setOptions("");
    setEditingField(null);
  };

  const handleEditField = (field: CustomFieldDefinition) => {
    setEditingField(field);
    setFieldEntityType(field.entityType);
    setFieldKey(field.fieldKey);
    setDisplayLabel(field.displayLabel);
    setFieldType(field.fieldType);
    setHelpText(field.helpText || "");
    setRequired(field.required);
    setOptions(field.options ? JSON.stringify(field.options) : "");
    setCustomFieldDialogOpen(true);
  };

  const handleSaveField = () => {
    const data: any = {
      entityType: fieldEntityType,
      fieldKey: fieldKey,
      displayLabel: displayLabel,
      fieldType: fieldType,
      helpText: helpText || null,
      required: required,
      options: (fieldType === 'select' || fieldType === 'multi_select') && options ? JSON.parse(options) : null,
    };

    if (editingField) {
      updateFieldMutation.mutate({ id: editingField.id, data });
    } else {
      createFieldMutation.mutate(data);
    }
  };

  const handlePasswordChange = async () => {
    if (newPassword !== confirmPassword) {
      toast({
        title: "Error",
        description: "New passwords do not match.",
        variant: "destructive",
      });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    toast({
      title: "Success",
      description: "Your password has been updated.",
    });

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const contactFields = customFields?.filter(f => f.entityType === 'contact') || [];
  const accountFields = customFields?.filter(f => f.entityType === 'account') || [];
  const mfaEnabled = !!mfaStatus?.mfaEnabled;
  const mfaToggleDisabled = mfaStatusLoading || enrollMfaMutation.isLoading || confirmMfaMutation.isLoading || disableMfaMutation.isLoading;

  return (
    
      
        Settings
        
          Manage your account and system preferences
        
      

      
        
          
            
            Profile
          
          
            
            Custom Fields
          
          
            
            Notifications
          
          
            
            Integrations
          
          
            
            Security
          
          
            
            Background Jobs
          
          
            
            Google Cloud
          
        

        
          
            
              Profile Information
              
                Update your personal information and account details
              
            
            
              
                
                  First Name
                  
                
                
                  Last Name
                  
                
              
              
                Email
                
              
              
                Role
                
              
              Save Changes
            
          
        

        
          
            
              
                
                  Contact Custom Fields
                  
                    Define custom fields for contacts
                  
                
                 {
                  if (!open) resetFieldForm();
                  setCustomFieldDialogOpen(open);
                }}>
                  
                     setFieldEntityType('contact')}>
                      
                      Add Field
                    
                  
                  
                    
                      {editingField ? 'Edit' : 'Create'} Contact Custom Field
                      
                        Define a custom field for contacts
                      
                    
                    
                      
                        Field Key (internal)
                         setFieldKey(e.target.value)}
                          placeholder="e.g., lead_score"
                          disabled={!!editingField}
                        />
                      
                      
                        Display Label
                         setDisplayLabel(e.target.value)}
                          placeholder="e.g., Lead Score"
                        />
                      
                      
                        Field Type
                        
                          
                            
                          
                          
                            Text
                            Number
                            Date
                            Boolean
                            Select (dropdown)
                            Multi-Select
                            URL
                            Email
                          
                        
                      
                      {(fieldType === 'select' || fieldType === 'multi_select') && (
                        
                          Options (JSON array)
                           setOptions(e.target.value)}
                            placeholder='["Option 1", "Option 2", "Option 3"]'
                          />
                        
                      )}
                      
                        Help Text
                         setHelpText(e.target.value)}
                          placeholder="Optional helper text"
                        />
                      
                      
                        
                        Required Field
                      
                    
                    
                       setCustomFieldDialogOpen(false)}>
                        Cancel
                      
                      
                        {editingField ? 'Update' : 'Create'} Field
                      
                    
                  
                
              
            
            
              
                
                  
                    Label
                    Key
                    Type
                    Required
                    Actions
                  
                
                
                  {contactFields.length === 0 ? (
                    
                      
                        No custom fields defined
                      
                    
                  ) : (
                    contactFields.map((field) => (
                      
                        {field.displayLabel}
                        {field.fieldKey}
                        
                          {field.fieldType}
                        
                        
                          {field.required ? Required : Optional}
                        
                        
                          
                             handleEditField(field)}
                            >
                              
                            
                             {
                                if (confirm('Are you sure you want to delete this field?')) {
                                  deleteFieldMutation.mutate(field.id);
                                }
                              }}
                            >
                              
                            
                          
                        
                      
                    ))
                  )}
                
              
            
          

          
            
              
                
                  Account Custom Fields
                  
                    Define custom fields for accounts
                  
                
                 {
                  if (!open) resetFieldForm();
                  setCustomFieldDialogOpen(open);
                }}>
                  
                     setFieldEntityType('account')}>
                      
                      Add Field
                    
                  
                  
                    
                      {editingField ? 'Edit' : 'Create'} Account Custom Field
                      
                        Define a custom field for accounts
                      
                    
                    
                      
                        Field Key (internal)
                         setFieldKey(e.target.value)}
                          placeholder="e.g., contract_type"
                          disabled={!!editingField}
                        />
                      
                      
                        Display Label
                         setDisplayLabel(e.target.value)}
                          placeholder="e.g., Contract Type"
                        />
                      
                      
                        Field Type
                        
                          
                            
                          
                          
                            Text
                            Number
                            Date
                            Boolean
                            Select (dropdown)
                            Multi-Select
                            URL
                            Email
                          
                        
                      
                      {(fieldType === 'select' || fieldType === 'multi_select') && (
                        
                          Options (JSON array)
                           setOptions(e.target.value)}
                            placeholder='["Option 1", "Option 2", "Option 3"]'
                          />
                        
                      )}
                      
                        Help Text
                         setHelpText(e.target.value)}
                          placeholder="Optional helper text"
                        />
                      
                      
                        
                        Required Field
                      
                    
                    
                       setCustomFieldDialogOpen(false)}>
                        Cancel
                      
                      
                        {editingField ? 'Update' : 'Create'} Field
                      
                    
                  
                
              
            
            
              
                
                  
                    Label
                    Key
                    Type
                    Required
                    Actions
                  
                
                
                  {accountFields.length === 0 ? (
                    
                      
                        No custom fields defined
                      
                    
                  ) : (
                    accountFields.map((field) => (
                      
                        {field.displayLabel}
                        {field.fieldKey}
                        
                          {field.fieldType}
                        
                        
                          {field.required ? Required : Optional}
                        
                        
                          
                             handleEditField(field)}
                            >
                              
                            
                             {
                                if (confirm('Are you sure you want to delete this field?')) {
                                  deleteFieldMutation.mutate(field.id);
                                }
                              }}
                            >
                              
                            
                          
                        
                      
                    ))
                  )}
                
              
            
          
        

        
          
            
              Notification Preferences
              
                Choose how you want to be notified about important events
              
            
            
              
                
                  Campaign Completion
                  
                    Get notified when a campaign completes
                  
                
                
              
              
                
                  Lead Approvals
                  
                    Get notified when leads are ready for review
                  
                
                
              
              
                
                  Import Completion
                  
                    Get notified when bulk imports finish
                  
                
                
              
              
                
                  Order Updates
                  
                    Get notified about client order status changes
                  
                
                
              
            
          
        

        
          
          

          
            
              Email Service Provider
              
                Configure your ESP for email campaigns
              
            
            
              
                
                  
                  
                    SendGrid
                    Connected
                  
                
                
                  Configure
                
              
            
          

          
            
              Telephony Provider
              
                Configure Telnyx for telemarketing campaigns
              
            
            
              
                
                  
                  
                    Telnyx
                    Not connected
                  
                
                
                  Connect
                
              
            
          

          
        

        
          
            
              Change Password
              
                Update your password to keep your account secure
              
            
            
              
                Current Password
                 setCurrentPassword(e.target.value)}
                  data-testid="input-current-password"
                />
              
              
                New Password
                 setNewPassword(e.target.value)}
                  data-testid="input-new-password"
                />
              
              
                Confirm New Password
                 setConfirmPassword(e.target.value)}
                  data-testid="input-confirm-password"
                />
              
              
                Update Password
              
            
          

          
            
              Two-Factor Authentication
              
                Add an extra layer of security to your account
              
            
            
              
                
                  Enable 2FA (Google Authenticator)
                  
                    Require a time-based code in addition to your password.
                  
                  {mfaStatusLoading ? (
                    Checking status...
                  ) : (
                    
                      {mfaEnabled ? "Enabled" : "Disabled"}
                    
                  )}
                
                 {
                    if (checked) {
                      enrollMfaMutation.mutate();
                    } else if (mfaEnabled) {
                      setMfaDisableDialogOpen(true);
                    }
                  }}
                  disabled={mfaToggleDisabled}
                  data-testid="switch-2fa"
                />
              
              {mfaEnabled && (
                
                  Keep your backup codes safe in case you lose access to your authenticator.
                
              )}
            
          

           {
              if (!open) {
                setMfaDialogOpen(false);
                setMfaSetup(null);
                setMfaConfirmCode("");
              }
            }}
          >
            
              
                Enable 2FA with Google Authenticator
                
                  Scan the QR code, then enter the 6-digit code to confirm.
                
              
              {!mfaSetup ? (
                Loading setup...
              ) : (
                
                  
                    
                    
                      Can't scan? Enter this key manually:{" "}
                      {mfaSetup.secret}
                    
                  
                  
                    Verification code
                     setMfaConfirmCode(e.target.value)}
                    />
                  
                  
                    Backup codes
                    
                      Save these codes in a safe place. Each code can be used once.
                    
                    
                      {mfaSetup.backupCodes.map((code) => (
                        
                          {code}
                        
                      ))}
                    
                  
                
              )}
              
                 {
                    setMfaDialogOpen(false);
                    setMfaSetup(null);
                    setMfaConfirmCode("");
                  }}
                >
                  Cancel
                
                 confirmMfaMutation.mutate()}
                  disabled={!mfaConfirmCode || confirmMfaMutation.isLoading}
                >
                  {confirmMfaMutation.isLoading ? "Confirming..." : "Confirm"}
                
              
            
          

           {
              if (!open) {
                setMfaDisableDialogOpen(false);
                setMfaDisablePassword("");
              }
            }}
          >
            
              
                Disable 2FA
                
                  Enter your password to turn off multi-factor authentication.
                
              
              
                Password
                 setMfaDisablePassword(e.target.value)}
                />
              
              
                 {
                    setMfaDisableDialogOpen(false);
                    setMfaDisablePassword("");
                  }}
                >
                  Cancel
                
                 disableMfaMutation.mutate()}
                  disabled={!mfaDisablePassword || disableMfaMutation.isLoading}
                >
                  {disableMfaMutation.isLoading ? "Disabling..." : "Disable 2FA"}
                
              
            
          
        

        
          
        

        
          
        
      
    
  );
}

// Mailgun Webhooks Management Component
function MailgunWebhooksCard() {
  const { toast } = useToast();

  const { data: webhookData, isLoading, refetch } = useQuery;
  }>({
    queryKey: ['/api/admin/mailgun/webhooks'],
    retry: false,
  });

  const switchModeMutation = useMutation({
    mutationFn: async (mode: 'dev' | 'production') => {
      const response = await apiRequest('POST', '/api/admin/mailgun/register-webhooks', { mode });
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Webhook URL switched",
        description: `Now using ${data.mode} URL: ${data.webhookUrl}`,
      });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Switch failed",
        description: error.message,
      });
    },
  });

  const currentMode = webhookData?.currentEnvUrl?.includes('ngrok') ? 'dev' : 'production';

  return (
    
      
        
          
            
              
              Mailgun Webhooks
            
            
              Manage webhook URLs for email event tracking (delivered, opened, clicked, bounced, etc.)
            
          
           refetch()} disabled={isLoading}>
            
          
        
      
      
        {isLoading ? (
          
            
          
        ) : webhookData ? (
          <>
            {/* Current Mode & URL */}
            
              
                
                
                  Domain: {webhookData.domain || 'Not configured'}
                  
                    Active URL: {webhookData.currentEnvUrl || 'Not set'}
                  
                
              
              
                {currentMode === 'dev' ? 'Dev (ngrok)' : 'Production'}
              
            

            {/* Switch Buttons */}
            
               switchModeMutation.mutate('dev')}
                disabled={switchModeMutation.isPending || currentMode === 'dev'}
              >
                {switchModeMutation.isPending ?  : null}
                Switch to Dev (ngrok)
              
               switchModeMutation.mutate('production')}
                disabled={switchModeMutation.isPending || currentMode === 'production'}
              >
                {switchModeMutation.isPending ?  : null}
                Switch to Production
              
            

            {/* Registered Webhooks */}
            {webhookData.webhooks && typeof webhookData.webhooks === 'object' && (
              
                Registered Webhooks in Mailgun
                
                  {Object.entries(webhookData.webhooks).map(([event, config]) => {
                    const urls = typeof config === 'object' && config !== null && 'urls' in config
                      ? (config as { urls: string[] }).urls
                      : [String(config)];
                    return (
                      
                        {event}
                        
                          {urls.map((url: string, i: number) => (
                            
                              {url}
                            
                          ))}
                          {urls.length === 0 && (
                            Not configured
                          )}
                        
                      
                    );
                  })}
                
              
            )}
          
        ) : (
          
            Unable to fetch Mailgun webhook configuration.
            Check that MAILGUN_API_KEY and MAILGUN_DOMAIN are configured.
          
        )}
      
    
  );
}

// Microsoft 365 Integration Component
function Microsoft365IntegrationCard() {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ['/api/oauth/microsoft/status'],
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/oauth/microsoft/disconnect');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/oauth/microsoft/status'] });
      toast({
        title: "Disconnected",
        description: "Microsoft 365 mailbox has been disconnected",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to disconnect mailbox",
      });
    },
  });

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      const response = await apiRequest('GET', '/api/oauth/microsoft/authorize');
      const data = await response.json();
      const authUrl = data.authUrl;
      
      console.log('[M365 OAuth] Opening URL:', authUrl);
      
      // Open OAuth window
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const authWindow = window.open(
        authUrl,
        'Microsoft 365 OAuth',
        `width=${width},height=${height},left=${left},top=${top}`
      );
      
      console.log('[M365 OAuth] Popup opened:', authWindow ? 'Success' : 'Failed');

      // Check if popup was blocked
      if (!authWindow || authWindow.closed || typeof authWindow.closed === 'undefined') {
        setIsConnecting(false);
        toast({
          variant: "destructive",
          title: "Popup Blocked",
          description: "Please allow popups for this site to connect your Microsoft 365 account",
        });
        return;
      }

      // Listen for postMessage from popup
      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'oauth-success' && event.data.provider === 'microsoft') {
          clearInterval(pollTimer);
          window.removeEventListener('message', handleMessage);
          setIsConnecting(false);
          queryClient.invalidateQueries({ queryKey: ['/api/oauth/microsoft/status'] });
          toast({
            title: "Connected",
            description: "Microsoft 365 account connected successfully",
          });
        } else if (event.data.type === 'oauth-error' && event.data.provider === 'microsoft') {
          clearInterval(pollTimer);
          window.removeEventListener('message', handleMessage);
          setIsConnecting(false);
          toast({
            variant: "destructive",
            title: "Connection Failed",
            description: event.data.error || "Failed to connect Microsoft 365 account",
          });
        }
      };
      window.addEventListener('message', handleMessage);

      // Poll for window close as fallback
      const pollTimer = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(pollTimer);
          window.removeEventListener('message', handleMessage);
          setIsConnecting(false);
          queryClient.invalidateQueries({ queryKey: ['/api/oauth/microsoft/status'] });
        }
      }, 500);

    } catch (error: any) {
      setIsConnecting(false);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to initiate OAuth flow",
      });
    }
  };

  const handleDisconnect = () => {
    if (confirm('Are you sure you want to disconnect your Microsoft 365 mailbox?')) {
      disconnectMutation.mutate();
    }
  };

  return (
    
      
        
          
          Microsoft 365 Integration
        
        
          Connect your Microsoft 365 account to sync emails and enable automated email sequences
        
      
      
        {isLoading ? (
          
            Loading...
          
        ) : status?.connected ? (
          
            
              
                
                
                  
                    {status.displayName || 'Microsoft 365'}
                    
                      Connected
                    
                  
                  
                    {status.mailboxEmail}
                  
                  {status.connectedAt && (
                    
                      Connected {new Date(status.connectedAt).toLocaleDateString()}
                    
                  )}
                
              
              
                {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
              
            

            
              Enabled Features:
              
                
                  
                  Email sync and history
                
                
                  
                  Automated email sequences
                
                
                  
                  Contact engagement tracking
                
              
            
          
        ) : (
          
            
              
                
                
                  Microsoft 365
                  Not connected
                
              
              
                
                {isConnecting ? 'Connecting...' : 'Connect'}
              
            

            
              Connect to unlock:
              
                Automatic email synchronization
                Email sequence automation
                Contact engagement history
                Email analytics and insights
              
            
          
        )}
      
    
  );
}

// Google Integration Component
function GoogleIntegrationCard() {
  const { toast } = useToast();
  const [isConnecting, setIsConnecting] = useState(false);

  const { data: status, isLoading } = useQuery({
    queryKey: ['/api/oauth/google/status'],
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('POST', '/api/oauth/google/disconnect');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/oauth/google/status'] });
      toast({
        title: "Disconnected",
        description: "Google mailbox has been disconnected",
      });
    },
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to disconnect mailbox",
      });
    },
  });

  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      const response = await apiRequest('GET', '/api/oauth/google/authorize');
      const data = await response.json();
      const authUrl = data.authUrl;

      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;

      const authWindow = window.open(
        authUrl,
        'Google OAuth',
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!authWindow || authWindow.closed || typeof authWindow.closed === 'undefined') {
        setIsConnecting(false);
        toast({
          variant: "destructive",
          title: "Popup Blocked",
          description: "Please allow popups for this site to connect your Google account",
        });
        return;
      }

      const handleMessage = (event: MessageEvent) => {
        if (event.data.type === 'oauth-success' && event.data.provider === 'google') {
          clearInterval(pollTimer);
          window.removeEventListener('message', handleMessage);
          setIsConnecting(false);
          queryClient.invalidateQueries({ queryKey: ['/api/oauth/google/status'] });
          toast({
            title: "Connected",
            description: "Google account connected successfully",
          });
        } else if (event.data.type === 'oauth-error' && event.data.provider === 'google') {
          clearInterval(pollTimer);
          window.removeEventListener('message', handleMessage);
          setIsConnecting(false);
          toast({
            variant: "destructive",
            title: "Connection Failed",
            description: event.data.error || "Failed to connect Google account",
          });
        }
      };
      window.addEventListener('message', handleMessage);

      const pollTimer = setInterval(() => {
        if (authWindow?.closed) {
          clearInterval(pollTimer);
          window.removeEventListener('message', handleMessage);
          setIsConnecting(false);
          queryClient.invalidateQueries({ queryKey: ['/api/oauth/google/status'] });
        }
      }, 500);
    } catch (error: any) {
      setIsConnecting(false);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to initiate OAuth flow",
      });
    }
  };

  const handleDisconnect = () => {
    if (confirm('Are you sure you want to disconnect your Google mailbox?')) {
      disconnectMutation.mutate();
    }
  };

  return (
    
      
        
          
          Google Workspace / Gmail Integration
        
        
          Connect your Google account to sync emails and send from your inbox
        
      
      
        {isLoading ? (
          
            Loading...
          
        ) : status?.connected ? (
          
            
              
                
                
                  
                    {status.displayName || 'Google'}
                    
                      Connected
                    
                  
                  
                    {status.mailboxEmail}
                  
                  {status.connectedAt && (
                    
                      Connected {new Date(status.connectedAt).toLocaleDateString()}
                    
                  )}
                
              
              
                {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
              
            

            
              Enabled Features:
              
                
                  
                  Inbox sync and history
                
                
                  
                  Send and reply from Gmail
                
              
            
          
        ) : (
          
            
              
                
                
                  Google Workspace / Gmail
                  Not connected
                
              
              
                
                {isConnecting ? 'Connecting...' : 'Connect'}
              
            

            
              Connect to unlock:
              
                Automatic inbox synchronization
                Email replies from Gmail
                Contact engagement history
              
            
          
        )}
      
    
  );
}

// Background Jobs Tab Component
function BackgroundJobsTab() {
  const { toast } = useToast();
  const [isTriggeringEmail, setIsTriggeringEmail] = useState(false);
  const [isTriggeringAI, setIsTriggeringAI] = useState(false);

  const { data: jobStatus, isLoading } = useQuery({
    queryKey: ['/api/jobs/status'],
  });

  const triggerEmailValidation = async () => {
    setIsTriggeringEmail(true);
    try {
      const result: any = await apiRequest('POST', '/api/jobs/trigger-email-validation');
      toast({
        title: "Email Validation Started",
        description: result.message || "Email validation job has been triggered successfully",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to trigger email validation",
      });
    } finally {
      setIsTriggeringEmail(false);
    }
  };

  const triggerAiEnrichment = async () => {
    setIsTriggeringAI(true);
    try {
      const result: any = await apiRequest('POST', '/api/jobs/trigger-ai-enrichment');
      toast({
        title: "AI Enrichment Started",
        description: result.message || "AI enrichment job has been triggered successfully",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to trigger AI enrichment",
      });
    } finally {
      setIsTriggeringAI(false);
    }
  };

  if (isLoading) {
    return Loading...;
  }

  return (
    
      
        
          
            
            Background Jobs Management
          
          
            Control automated background jobs for email validation and AI enrichment
          
        
        
          {/* Email Validation Job */}
          
            
              
                
                  
                  Email Validation Job
                
                
                  Validates pending contact email addresses using DNS and SMTP checks
                
              
              
                {jobStatus?.emailValidation?.mode || 'manual'}
              
            
            
              
                
                {isTriggeringEmail ? 'Triggering...' : 'Run Now'}
              
              {!jobStatus?.emailValidation?.enabled && (
                
                  Automatic scheduling is disabled - use manual trigger
                
              )}
            
          

          {/* AI Enrichment Job */}
          
            
              
                
                  
                  AI Enrichment Job
                
                
                  Enriches contacts missing phone and address data using AI
                
              
              
                {jobStatus?.aiEnrichment?.mode || 'manual'}
              
            
            
              
                
                {isTriggeringAI ? 'Triggering...' : 'Run Now'}
              
              {!jobStatus?.aiEnrichment?.enabled && (
                
                  Automatic scheduling is disabled - use manual trigger
                
              )}
            
          

          {/* Info Alert */}
          
            
              Note: Background jobs are currently configured for manual execution only. 
              To enable automatic scheduling, set the environment variables ENABLE_EMAIL_VALIDATION=true and 
              ENABLE_AI_ENRICHMENT=true and restart the server.
            
          
        
      
    
  );
}