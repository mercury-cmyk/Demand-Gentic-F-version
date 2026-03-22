import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreHorizontal,
  Trash2,
  Loader2,
  Mail,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock,
  Send,
  RefreshCw,
  Star,
  StarOff,
  Power,
  PowerOff,
  ExternalLink,
  Settings2,
} from "lucide-react";
import { format } from "date-fns";

// Google icon SVG component
const GoogleIcon = () => (
  
    
    
    
    
  
);

// Microsoft icon SVG component
const MicrosoftIcon = () => (
  
    
    
    
    
  
);

interface SmtpProvider {
  id: string;
  name: string;
  providerType: "gmail" | "outlook" | "custom";
  authType: "oauth2" | "basic" | "app_password";
  emailAddress: string;
  displayName?: string;
  dailySendLimit?: number;
  hourlySendLimit?: number;
  sentToday?: number;
  sentThisHour?: number;
  isActive: boolean;
  isDefault: boolean;
  verificationStatus: "pending" | "verifying" | "verified" | "failed";
  lastVerifiedAt?: string;
  lastVerificationError?: string;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export default function SmtpProvidersPage() {
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(null);
  const [showTestDialog, setShowTestDialog] = useState(null);
  const [testEmail, setTestEmail] = useState("");
  const [newProvider, setNewProvider] = useState({
    name: "",
    providerType: "gmail" as "gmail" | "outlook" | "custom",
    authType: "oauth2" as "oauth2" | "basic" | "app_password",
    emailAddress: "",
    displayName: "",
    dailySendLimit: 500,
    hourlySendLimit: 25,
    // Custom SMTP fields
    smtpHost: "",
    smtpPort: 465,
    smtpSecure: true,
    smtpUsername: "",
    smtpPassword: "",
  });

  // Check URL params for OAuth callback messages
  const urlParams = new URLSearchParams(window.location.search);
  const successParam = urlParams.get("success");
  const errorParam = urlParams.get("error");

  if (successParam || errorParam) {
    // Clear URL params
    window.history.replaceState({}, "", window.location.pathname);
  }

  // Fetch providers
  const { data: providers = [], isLoading } = useQuery({
    queryKey: ["/api/communications/smtp-providers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/communications/smtp-providers");
      return res.json();
    },
  });

  // Create provider mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof newProvider) => {
      const res = await apiRequest("POST", "/api/communications/smtp-providers", data);
      return res.json();
    },
    onSuccess: (provider) => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications/smtp-providers"] });
      toast({ title: "Provider created", description: "SMTP provider has been created successfully." });
      setShowCreateDialog(false);
      resetNewProvider();

      // If OAuth provider, initiate OAuth flow
      if (provider.authType === "oauth2") {
        initiateOAuth(provider);
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Delete provider mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/communications/smtp-providers/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications/smtp-providers"] });
      toast({ title: "Provider deleted", description: "SMTP provider has been deleted." });
      setShowDeleteDialog(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Verify connection mutation
  const verifyMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/communications/smtp-providers/${id}/verify`);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications/smtp-providers"] });
      if (result.success) {
        toast({ title: "Connection verified", description: "SMTP connection is working correctly." });
      } else {
        toast({ title: "Verification failed", description: result.error, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Send test email mutation
  const sendTestMutation = useMutation({
    mutationFn: async ({ id, toEmail }: { id: string; toEmail: string }) => {
      const res = await apiRequest("POST", `/api/communications/smtp-providers/${id}/send-test`, { toEmail });
      return res.json();
    },
    onSuccess: (result) => {
      if (result.success) {
        toast({ title: "Test email sent", description: "Check your inbox for the test email." });
        setShowTestDialog(null);
        setTestEmail("");
      } else {
        toast({ title: "Failed to send", description: result.error, variant: "destructive" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/communications/smtp-providers/${id}/toggle-active`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications/smtp-providers"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Set default mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/communications/smtp-providers/${id}/set-default`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications/smtp-providers"] });
      toast({ title: "Default updated", description: "Default SMTP provider has been updated." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const resetNewProvider = () => {
    setNewProvider({
      name: "",
      providerType: "gmail",
      authType: "oauth2",
      emailAddress: "",
      displayName: "",
      dailySendLimit: 500,
      hourlySendLimit: 25,
      smtpHost: "",
      smtpPort: 465,
      smtpSecure: true,
      smtpUsername: "",
      smtpPassword: "",
    });
  };

  const initiateOAuth = async (provider: SmtpProvider) => {
    const endpoint =
      provider.providerType === "gmail"
        ? `/api/communications/smtp-providers/${provider.id}/oauth/google/initiate`
        : `/api/communications/smtp-providers/${provider.id}/oauth/microsoft/initiate`;

    try {
      const res = await apiRequest("GET", endpoint);
      const { authUrl } = await res.json();
      window.location.href = authUrl;
    } catch (error: any) {
      toast({ title: "OAuth Error", description: error.message, variant: "destructive" });
    }
  };

  const getStatusBadge = (status: SmtpProvider["verificationStatus"]) => {
    switch (status) {
      case "verified":
        return Verified;
      case "failed":
        return Failed;
      case "verifying":
        return Verifying;
      default:
        return Pending;
    }
  };

  const getProviderIcon = (type: SmtpProvider["providerType"]) => {
    switch (type) {
      case "gmail":
        return ;
      case "outlook":
        return ;
      default:
        return ;
    }
  };

  if (isLoading) {
    return (
      
        
        
          {[1, 2, 3].map((i) => (
            
          ))}
        
      
    );
  }

  return (
    
      {/* Header */}
      
        
          SMTP Providers
          
            Connect your email accounts for transactional email sending
          
        
         setShowCreateDialog(true)}>
          
          Add Provider
        
      

      {/* OAuth Callback Messages */}
      {successParam && (
        
          
            
            
              {successParam === "google_connected" && "Google Workspace connected successfully!"}
              {successParam === "microsoft_connected" && "Microsoft 365 connected successfully!"}
            
          
        
      )}

      {errorParam && (
        
          
            
            OAuth Error: {decodeURIComponent(errorParam)}
          
        
      )}

      {/* Providers Grid */}
      {providers.length === 0 ? (
        
          
            
            No SMTP Providers
            
              Connect your first email provider to start sending transactional emails
            
             setShowCreateDialog(true)}>
              
              Add Your First Provider
            
          
        
      ) : (
        
          {providers.map((provider) => (
            
              
                
                  
                    {getProviderIcon(provider.providerType)}
                    
                      
                        {provider.name}
                        {provider.isDefault && (
                          
                        )}
                      
                      {provider.emailAddress}
                    
                  
                  
                    
                      
                        
                      
                    
                    
                       verifyMutation.mutate(provider.id)}>
                        
                        Verify Connection
                      
                       setShowTestDialog(provider)}>
                        
                        Send Test Email
                      
                      
                      {provider.authType === "oauth2" && provider.verificationStatus !== "verified" && (
                         initiateOAuth(provider)}>
                          
                          Connect with {provider.providerType === "gmail" ? "Google" : "Microsoft"}
                        
                      )}
                       toggleActiveMutation.mutate(provider.id)}>
                        {provider.isActive ? (
                          <>
                            
                            Disable
                          
                        ) : (
                          <>
                            
                            Enable
                          
                        )}
                      
                      {!provider.isDefault && provider.verificationStatus === "verified" && (
                         setDefaultMutation.mutate(provider.id)}>
                          
                          Set as Default
                        
                      )}
                      
                       setShowDeleteDialog(provider.id)}
                      >
                        
                        Delete
                      
                    
                  
                
              
              
                
                  {getStatusBadge(provider.verificationStatus)}
                  {!provider.isActive && Disabled}
                

                {provider.lastVerificationError && provider.verificationStatus === "failed" && (
                  
                    {provider.lastVerificationError}
                  
                )}

                
                  
                    Today:
                    
                      {provider.sentToday || 0}/{provider.dailySendLimit || 500}
                    
                  
                  
                    This Hour:
                    
                      {provider.sentThisHour || 0}/{provider.hourlySendLimit || 25}
                    
                  
                

                {provider.lastUsedAt && (
                  
                    Last used: {format(new Date(provider.lastUsedAt), "MMM d, yyyy h:mm a")}
                  
                )}
              
            
          ))}
        
      )}

      {/* Create Provider Dialog */}
      
        
          
            Add SMTP Provider
            
              Connect an email account for sending transactional emails
            
          

          
            
              Provider Type
              
                  setNewProvider({
                    ...newProvider,
                    providerType: value as any,
                    authType: value === "custom" ? "basic" : "oauth2",
                  })
                }
              >
                
                  
                
                
                  
                    
                      
                      Google Workspace
                    
                  
                  
                    
                      
                      Microsoft 365 / Outlook
                    
                  
                  
                    
                      
                      Custom SMTP
                    
                  
                
              
            

            
              Provider Name
               setNewProvider({ ...newProvider, name: e.target.value })}
              />
            

            
              Email Address
               setNewProvider({ ...newProvider, emailAddress: e.target.value })}
              />
              {newProvider.providerType !== "custom" && (
                
                  This will be verified during OAuth connection
                
              )}
            

            
              Display Name (From Name)
               setNewProvider({ ...newProvider, displayName: e.target.value })}
              />
            

            {newProvider.providerType === "custom" && (
              <>
                
                  SMTP Configuration
                  
                    
                      SMTP Host
                       setNewProvider({ ...newProvider, smtpHost: e.target.value })}
                      />
                    
                    
                      Port
                      
                          setNewProvider({ ...newProvider, smtpPort: parseInt(e.target.value) })
                        }
                      />
                    
                    
                      Username
                       setNewProvider({ ...newProvider, smtpUsername: e.target.value })}
                      />
                    
                    
                      Password
                       setNewProvider({ ...newProvider, smtpPassword: e.target.value })}
                      />
                    
                  
                  
                    
                        setNewProvider({ ...newProvider, smtpSecure: checked })
                      }
                    />
                    Use SSL/TLS
                  
                
              
            )}

            
              
                Daily Send Limit
                
                    setNewProvider({ ...newProvider, dailySendLimit: parseInt(e.target.value) })
                  }
                />
              
              
                Hourly Send Limit
                
                    setNewProvider({ ...newProvider, hourlySendLimit: parseInt(e.target.value) })
                  }
                />
              
            
          

          
             setShowCreateDialog(false)}>
              Cancel
            
             createMutation.mutate(newProvider)}
              disabled={!newProvider.name || !newProvider.emailAddress || createMutation.isPending}
            >
              {createMutation.isPending && }
              {newProvider.providerType !== "custom" ? "Create & Connect" : "Create Provider"}
            
          
        
      

      {/* Delete Confirmation Dialog */}
       setShowDeleteDialog(null)}>
        
          
            Delete SMTP Provider?
            
              This will permanently delete this SMTP provider. Any transactional emails using this
              provider will fail until reassigned.
            
          
          
            Cancel
             showDeleteDialog && deleteMutation.mutate(showDeleteDialog)}
            >
              {deleteMutation.isPending && }
              Delete
            
          
        
      

      {/* Test Email Dialog */}
       setShowTestDialog(null)}>
        
          
            Send Test Email
            
              Send a test email to verify the SMTP provider is working correctly.
            
          
          
            
              Recipient Email
               setTestEmail(e.target.value)}
              />
            
          
          
             setShowTestDialog(null)}>
              Cancel
            
            
                showTestDialog && sendTestMutation.mutate({ id: showTestDialog.id, toEmail: testEmail })
              }
              disabled={!testEmail || sendTestMutation.isPending}
            >
              {sendTestMutation.isPending && }
              Send Test
            
          
        
      
    
  );
}