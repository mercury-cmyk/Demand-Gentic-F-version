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
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

// Microsoft icon SVG component
const MicrosoftIcon = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24">
    <rect x="1" y="1" width="10" height="10" fill="#F25022" />
    <rect x="13" y="1" width="10" height="10" fill="#7FBA00" />
    <rect x="1" y="13" width="10" height="10" fill="#00A4EF" />
    <rect x="13" y="13" width="10" height="10" fill="#FFB900" />
  </svg>
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
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [showTestDialog, setShowTestDialog] = useState<SmtpProvider | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [newProvider, setNewProvider] = useState({
    name: "",
    providerType: "gmail" as "gmail" | "outlook" | "custom",
    authType: "oauth2" as "oauth2" | "basic" | "app_password",
    emailAddress: "",
    displayName: "",
    dailySendLimit: 500,
    hourlySendLimit: 100,
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
  const { data: providers = [], isLoading } = useQuery<SmtpProvider[]>({
    queryKey: ["/api/smtp-providers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/smtp-providers");
      return res.json();
    },
  });

  // Create provider mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof newProvider) => {
      const res = await apiRequest("POST", "/api/smtp-providers", data);
      return res.json();
    },
    onSuccess: (provider) => {
      queryClient.invalidateQueries({ queryKey: ["/api/smtp-providers"] });
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
      const res = await apiRequest("DELETE", `/api/smtp-providers/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/smtp-providers"] });
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
      const res = await apiRequest("POST", `/api/smtp-providers/${id}/verify`);
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/smtp-providers"] });
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
      const res = await apiRequest("POST", `/api/smtp-providers/${id}/send-test`, { toEmail });
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
      const res = await apiRequest("POST", `/api/smtp-providers/${id}/toggle-active`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/smtp-providers"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Set default mutation
  const setDefaultMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/smtp-providers/${id}/set-default`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/smtp-providers"] });
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
      hourlySendLimit: 100,
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
        ? `/api/smtp-providers/${provider.id}/oauth/google/initiate`
        : `/api/smtp-providers/${provider.id}/oauth/microsoft/initiate`;

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
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Verified</Badge>;
      case "failed":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case "verifying":
        return <Badge variant="secondary"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Verifying</Badge>;
      default:
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
    }
  };

  const getProviderIcon = (type: SmtpProvider["providerType"]) => {
    switch (type) {
      case "gmail":
        return <GoogleIcon />;
      case "outlook":
        return <MicrosoftIcon />;
      default:
        return <Mail className="w-5 h-5 text-gray-500" />;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">SMTP Providers</h1>
          <p className="text-muted-foreground">
            Connect your email accounts for transactional email sending
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Add Provider
        </Button>
      </div>

      {/* OAuth Callback Messages */}
      {successParam && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="py-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-green-800">
              {successParam === "google_connected" && "Google Workspace connected successfully!"}
              {successParam === "microsoft_connected" && "Microsoft 365 connected successfully!"}
            </span>
          </CardContent>
        </Card>
      )}

      {errorParam && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4 flex items-center gap-3">
            <XCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-800">OAuth Error: {decodeURIComponent(errorParam)}</span>
          </CardContent>
        </Card>
      )}

      {/* Providers Grid */}
      {providers.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Mail className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No SMTP Providers</h3>
            <p className="text-muted-foreground mb-4">
              Connect your first email provider to start sending transactional emails
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add Your First Provider
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {providers.map((provider) => (
            <Card key={provider.id} className={provider.isDefault ? "border-primary" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {getProviderIcon(provider.providerType)}
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        {provider.name}
                        {provider.isDefault && (
                          <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                        )}
                      </CardTitle>
                      <CardDescription>{provider.emailAddress}</CardDescription>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => verifyMutation.mutate(provider.id)}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Verify Connection
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowTestDialog(provider)}>
                        <Send className="w-4 h-4 mr-2" />
                        Send Test Email
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {provider.authType === "oauth2" && provider.verificationStatus !== "verified" && (
                        <DropdownMenuItem onClick={() => initiateOAuth(provider)}>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Connect with {provider.providerType === "gmail" ? "Google" : "Microsoft"}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => toggleActiveMutation.mutate(provider.id)}>
                        {provider.isActive ? (
                          <>
                            <PowerOff className="w-4 h-4 mr-2" />
                            Disable
                          </>
                        ) : (
                          <>
                            <Power className="w-4 h-4 mr-2" />
                            Enable
                          </>
                        )}
                      </DropdownMenuItem>
                      {!provider.isDefault && provider.verificationStatus === "verified" && (
                        <DropdownMenuItem onClick={() => setDefaultMutation.mutate(provider.id)}>
                          <Star className="w-4 h-4 mr-2" />
                          Set as Default
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => setShowDeleteDialog(provider.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-2">
                  {getStatusBadge(provider.verificationStatus)}
                  {!provider.isActive && <Badge variant="outline">Disabled</Badge>}
                </div>

                {provider.lastVerificationError && provider.verificationStatus === "failed" && (
                  <div className="text-xs text-red-600 bg-red-50 p-2 rounded">
                    {provider.lastVerificationError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Today:</span>
                    <span className="ml-1 font-medium">
                      {provider.sentToday || 0}/{provider.dailySendLimit || 500}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">This Hour:</span>
                    <span className="ml-1 font-medium">
                      {provider.sentThisHour || 0}/{provider.hourlySendLimit || 100}
                    </span>
                  </div>
                </div>

                {provider.lastUsedAt && (
                  <div className="text-xs text-muted-foreground">
                    Last used: {format(new Date(provider.lastUsedAt), "MMM d, yyyy h:mm a")}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Provider Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Add SMTP Provider</DialogTitle>
            <DialogDescription>
              Connect an email account for sending transactional emails
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Provider Type</Label>
              <Select
                value={newProvider.providerType}
                onValueChange={(value) =>
                  setNewProvider({
                    ...newProvider,
                    providerType: value as any,
                    authType: value === "custom" ? "basic" : "oauth2",
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gmail">
                    <div className="flex items-center gap-2">
                      <GoogleIcon />
                      Google Workspace
                    </div>
                  </SelectItem>
                  <SelectItem value="outlook">
                    <div className="flex items-center gap-2">
                      <MicrosoftIcon />
                      Microsoft 365 / Outlook
                    </div>
                  </SelectItem>
                  <SelectItem value="custom">
                    <div className="flex items-center gap-2">
                      <Settings2 className="w-5 h-5" />
                      Custom SMTP
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="name">Provider Name</Label>
              <Input
                id="name"
                placeholder="e.g., Marketing Team Email"
                value={newProvider.name}
                onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email Address</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={newProvider.emailAddress}
                onChange={(e) => setNewProvider({ ...newProvider, emailAddress: e.target.value })}
              />
              {newProvider.providerType !== "custom" && (
                <p className="text-xs text-muted-foreground">
                  This will be verified during OAuth connection
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name (From Name)</Label>
              <Input
                id="displayName"
                placeholder="DemandGentic"
                value={newProvider.displayName}
                onChange={(e) => setNewProvider({ ...newProvider, displayName: e.target.value })}
              />
            </div>

            {newProvider.providerType === "custom" && (
              <>
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-3">SMTP Configuration</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>SMTP Host</Label>
                      <Input
                        placeholder="smtp.example.com"
                        value={newProvider.smtpHost}
                        onChange={(e) => setNewProvider({ ...newProvider, smtpHost: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Port</Label>
                      <Input
                        type="number"
                        value={newProvider.smtpPort}
                        onChange={(e) =>
                          setNewProvider({ ...newProvider, smtpPort: parseInt(e.target.value) })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Username</Label>
                      <Input
                        value={newProvider.smtpUsername}
                        onChange={(e) => setNewProvider({ ...newProvider, smtpUsername: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Password</Label>
                      <Input
                        type="password"
                        value={newProvider.smtpPassword}
                        onChange={(e) => setNewProvider({ ...newProvider, smtpPassword: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3">
                    <Switch
                      checked={newProvider.smtpSecure}
                      onCheckedChange={(checked) =>
                        setNewProvider({ ...newProvider, smtpSecure: checked })
                      }
                    />
                    <Label>Use SSL/TLS</Label>
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Daily Send Limit</Label>
                <Input
                  type="number"
                  value={newProvider.dailySendLimit}
                  onChange={(e) =>
                    setNewProvider({ ...newProvider, dailySendLimit: parseInt(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Hourly Send Limit</Label>
                <Input
                  type="number"
                  value={newProvider.hourlySendLimit}
                  onChange={(e) =>
                    setNewProvider({ ...newProvider, hourlySendLimit: parseInt(e.target.value) })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createMutation.mutate(newProvider)}
              disabled={!newProvider.name || !newProvider.emailAddress || createMutation.isPending}
            >
              {createMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {newProvider.providerType !== "custom" ? "Create & Connect" : "Create Provider"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete SMTP Provider?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this SMTP provider. Any transactional emails using this
              provider will fail until reassigned.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => showDeleteDialog && deleteMutation.mutate(showDeleteDialog)}
            >
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Test Email Dialog */}
      <Dialog open={!!showTestDialog} onOpenChange={() => setShowTestDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Test Email</DialogTitle>
            <DialogDescription>
              Send a test email to verify the SMTP provider is working correctly.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="testEmail">Recipient Email</Label>
              <Input
                id="testEmail"
                type="email"
                placeholder="test@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTestDialog(null)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                showTestDialog && sendTestMutation.mutate({ id: showTestDialog.id, toEmail: testEmail })
              }
              disabled={!testEmail || sendTestMutation.isPending}
            >
              {sendTestMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Send Test
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
