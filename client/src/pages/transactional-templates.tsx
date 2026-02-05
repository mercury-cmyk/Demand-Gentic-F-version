import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { sanitizeHtmlForIframePreview } from "@/lib/html-preview";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  FileText,
  Copy,
  Eye,
  Pencil,
  Star,
  StarOff,
  CheckCircle,
  History,
  Search,
  Filter,
} from "lucide-react";
import { format } from "date-fns";

const EVENT_TYPES = [
  { value: "welcome", label: "Welcome Email", description: "Sent when a new user signs up" },
  { value: "password_reset", label: "Password Reset", description: "Sent when user requests password reset" },
  { value: "password_changed", label: "Password Changed", description: "Confirmation after password change" },
  { value: "account_verification", label: "Account Verification", description: "Email verification link" },
  { value: "account_updated", label: "Account Updated", description: "Notification of account changes" },
  { value: "notification", label: "Generic Notification", description: "General system notifications" },
  { value: "lead_alert", label: "Lead Alert", description: "New qualified lead notification" },
  { value: "campaign_completed", label: "Campaign Completed", description: "Campaign completion summary" },
  { value: "report_ready", label: "Report Ready", description: "Report is ready for download" },
  { value: "invoice", label: "Invoice", description: "Billing and invoice emails" },
  { value: "subscription_expiring", label: "Subscription Expiring", description: "Subscription renewal reminder" },
  { value: "two_factor_code", label: "Two-Factor Code", description: "2FA verification code" },
];

interface TransactionalTemplate {
  id: string;
  eventType: string;
  name: string;
  description?: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  variables?: Array<{
    name: string;
    description: string;
    required: boolean;
    defaultValue?: string;
  }>;
  smtpProviderId?: string;
  isActive: boolean;
  isDefault: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface SmtpProvider {
  id: string;
  name: string;
  emailAddress: string;
  verificationStatus: string;
}

const DEFAULT_HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f4f4f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px;">
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; color: #1f2937; font-size: 24px;">{{title}}</h1>
              <p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.6;">
                {{message}}
              </p>
              {{#if actionUrl}}
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin: 30px 0;">
                <tr>
                  <td style="background-color: #2563eb; border-radius: 6px;">
                    <a href="{{actionUrl}}" style="display: inline-block; padding: 14px 30px; color: #ffffff; text-decoration: none; font-weight: 600;">
                      {{actionLabel}}
                    </a>
                  </td>
                </tr>
              </table>
              {{/if}}
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #6b7280; font-size: 12px; text-align: center;">
                DemandGentic - Enterprise Email Infrastructure
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export default function TransactionalTemplatesPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("templates");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterEventType, setFilterEventType] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<string | null>(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState<TransactionalTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<TransactionalTemplate | null>(null);
  const [previewVariables, setPreviewVariables] = useState<Record<string, string>>({});

  const [newTemplate, setNewTemplate] = useState({
    eventType: "welcome",
    name: "",
    description: "",
    subject: "",
    htmlContent: DEFAULT_HTML_TEMPLATE,
    textContent: "",
    smtpProviderId: "",
    isActive: true,
    isDefault: false,
    variables: [] as Array<{ name: string; description: string; required: boolean; defaultValue?: string }>,
  });

  // Fetch templates
  const { data: templates = [], isLoading: loadingTemplates } = useQuery<TransactionalTemplate[]>({
    queryKey: ["/api/transactional-templates", filterEventType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterEventType) params.set("eventType", filterEventType);
      const res = await apiRequest("GET", `/api/transactional-templates?${params}`);
      return res.json();
    },
  });

  // Fetch SMTP providers
  const { data: smtpProviders = [] } = useQuery<SmtpProvider[]>({
    queryKey: ["/api/smtp-providers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/smtp-providers");
      return res.json();
    },
  });

  // Fetch logs
  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["/api/transactional/logs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/transactional/logs?limit=50");
      return res.json();
    },
    enabled: activeTab === "logs",
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ["/api/transactional/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/transactional/stats");
      return res.json();
    },
  });

  // Create template mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof newTemplate) => {
      const res = await apiRequest("POST", "/api/transactional-templates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactional-templates"] });
      toast({ title: "Template created", description: "Transactional template has been created." });
      setShowCreateDialog(false);
      resetNewTemplate();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Update template mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<typeof newTemplate> }) => {
      const res = await apiRequest("PUT", `/api/transactional-templates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactional-templates"] });
      toast({ title: "Template updated", description: "Template has been updated." });
      setEditingTemplate(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Delete template mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("DELETE", `/api/transactional-templates/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactional-templates"] });
      toast({ title: "Template deleted", description: "Template has been deleted." });
      setShowDeleteDialog(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Duplicate template mutation
  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("POST", `/api/transactional-templates/${id}/duplicate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transactional-templates"] });
      toast({ title: "Template duplicated", description: "A copy has been created." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: async ({ id, variables }: { id: string; variables: Record<string, string> }) => {
      const res = await apiRequest("POST", `/api/transactional-templates/${id}/preview`, { variables });
      return res.json();
    },
  });

  const resetNewTemplate = () => {
    setNewTemplate({
      eventType: "welcome",
      name: "",
      description: "",
      subject: "",
      htmlContent: DEFAULT_HTML_TEMPLATE,
      textContent: "",
      smtpProviderId: "",
      isActive: true,
      isDefault: false,
      variables: [],
    });
  };

  const filteredTemplates = templates.filter((t) => {
    if (searchQuery && !t.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    return true;
  });

  const getEventTypeLabel = (eventType: string) => {
    return EVENT_TYPES.find((e) => e.value === eventType)?.label || eventType;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "sent":
      case "delivered":
        return <Badge className="bg-green-100 text-green-800">Sent</Badge>;
      case "failed":
      case "bounced":
        return <Badge variant="destructive">Failed</Badge>;
      case "pending":
      case "queued":
      case "sending":
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (loadingTemplates) {
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
          <h1 className="text-3xl font-bold">Transactional Emails</h1>
          <p className="text-muted-foreground">
            Manage templates for event-triggered transactional emails
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Template
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold">{stats.total || 0}</div>
              <p className="text-muted-foreground text-sm">Total Sent (30d)</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-green-600">{stats.sent + stats.delivered || 0}</div>
              <p className="text-muted-foreground text-sm">Delivered</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-red-600">{stats.failed || 0}</div>
              <p className="text-muted-foreground text-sm">Failed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-yellow-600">{stats.pending || 0}</div>
              <p className="text-muted-foreground text-sm">Pending</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="logs">Send Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={filterEventType || ""} onValueChange={(v) => setFilterEventType(v || null)}>
              <SelectTrigger className="w-48">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="All Event Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Event Types</SelectItem>
                {EVENT_TYPES.map((et) => (
                  <SelectItem key={et.value} value={et.value}>
                    {et.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Templates Grid */}
          {filteredTemplates.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Templates Found</h3>
                <p className="text-muted-foreground mb-4">
                  {searchQuery || filterEventType
                    ? "No templates match your filters"
                    : "Create your first transactional email template"}
                </p>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Template
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {filteredTemplates.map((template) => (
                <Card key={template.id} className={template.isDefault ? "border-primary" : ""}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg flex items-center gap-2">
                          {template.name}
                          {template.isDefault && <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />}
                        </CardTitle>
                        <CardDescription>{getEventTypeLabel(template.eventType)}</CardDescription>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditingTemplate(template)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setShowPreviewDialog(template)}>
                            <Eye className="w-4 h-4 mr-2" />
                            Preview
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => duplicateMutation.mutate(template.id)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => setShowDeleteDialog(template.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center gap-2">
                      {template.isActive ? (
                        <Badge className="bg-green-100 text-green-800">Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                      <Badge variant="secondary">v{template.version}</Badge>
                    </div>

                    <div className="text-sm">
                      <span className="text-muted-foreground">Subject:</span>
                      <p className="font-medium truncate">{template.subject}</p>
                    </div>

                    {template.variables && template.variables.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {template.variables.length} variable(s):{" "}
                        {template.variables.map((v) => v.name).join(", ")}
                      </div>
                    )}

                    <div className="text-xs text-muted-foreground">
                      Updated: {format(new Date(template.updatedAt), "MMM d, yyyy")}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="logs" className="space-y-4">
          {loadingLogs ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <History className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold mb-2">No Send History</h3>
                <p className="text-muted-foreground">
                  Transactional email logs will appear here
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <ScrollArea className="h-[600px]">
                  <div className="divide-y">
                    {logs.map((log: any) => (
                      <div key={log.id} className="p-4 flex items-center gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium truncate">{log.recipientEmail}</span>
                            {getStatusBadge(log.status)}
                          </div>
                          <div className="text-sm text-muted-foreground truncate">
                            {log.subject}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {getEventTypeLabel(log.eventType)} •{" "}
                            {format(new Date(log.createdAt), "MMM d, yyyy h:mm a")}
                          </div>
                        </div>
                        {log.errorMessage && (
                          <div className="text-xs text-red-600 max-w-xs truncate">
                            {log.errorMessage}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Create/Edit Template Dialog */}
      <Dialog
        open={showCreateDialog || !!editingTemplate}
        onOpenChange={(open) => {
          if (!open) {
            setShowCreateDialog(false);
            setEditingTemplate(null);
            resetNewTemplate();
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Template"}</DialogTitle>
            <DialogDescription>
              {editingTemplate
                ? "Update your transactional email template"
                : "Create a new transactional email template for event-triggered emails"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-2 gap-6 py-4">
            {/* Left Column - Settings */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Event Type</Label>
                <Select
                  value={editingTemplate?.eventType || newTemplate.eventType}
                  onValueChange={(value) =>
                    editingTemplate
                      ? setEditingTemplate({ ...editingTemplate, eventType: value })
                      : setNewTemplate({ ...newTemplate, eventType: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EVENT_TYPES.map((et) => (
                      <SelectItem key={et.value} value={et.value}>
                        <div>
                          <div>{et.label}</div>
                          <div className="text-xs text-muted-foreground">{et.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input
                  placeholder="e.g., Welcome Email - Standard"
                  value={editingTemplate?.name || newTemplate.name}
                  onChange={(e) =>
                    editingTemplate
                      ? setEditingTemplate({ ...editingTemplate, name: e.target.value })
                      : setNewTemplate({ ...newTemplate, name: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Subject Line</Label>
                <Input
                  placeholder="Welcome to {{companyName}}!"
                  value={editingTemplate?.subject || newTemplate.subject}
                  onChange={(e) =>
                    editingTemplate
                      ? setEditingTemplate({ ...editingTemplate, subject: e.target.value })
                      : setNewTemplate({ ...newTemplate, subject: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>SMTP Provider (Optional)</Label>
                <Select
                  value={editingTemplate?.smtpProviderId || newTemplate.smtpProviderId || ""}
                  onValueChange={(value) =>
                    editingTemplate
                      ? setEditingTemplate({ ...editingTemplate, smtpProviderId: value || undefined })
                      : setNewTemplate({ ...newTemplate, smtpProviderId: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Use default provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Use default provider</SelectItem>
                    {smtpProviders
                      .filter((p) => p.verificationStatus === "verified")
                      .map((provider) => (
                        <SelectItem key={provider.id} value={provider.id}>
                          {provider.name} ({provider.emailAddress})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingTemplate?.isActive ?? newTemplate.isActive}
                    onCheckedChange={(checked) =>
                      editingTemplate
                        ? setEditingTemplate({ ...editingTemplate, isActive: checked })
                        : setNewTemplate({ ...newTemplate, isActive: checked })
                    }
                  />
                  <Label>Active</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingTemplate?.isDefault ?? newTemplate.isDefault}
                    onCheckedChange={(checked) =>
                      editingTemplate
                        ? setEditingTemplate({ ...editingTemplate, isDefault: checked })
                        : setNewTemplate({ ...newTemplate, isDefault: checked })
                    }
                  />
                  <Label>Default for event type</Label>
                </div>
              </div>
            </div>

            {/* Right Column - Content */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>HTML Content</Label>
                <Textarea
                  className="font-mono text-sm h-64"
                  placeholder="Enter HTML email content..."
                  value={editingTemplate?.htmlContent || newTemplate.htmlContent}
                  onChange={(e) =>
                    editingTemplate
                      ? setEditingTemplate({ ...editingTemplate, htmlContent: e.target.value })
                      : setNewTemplate({ ...newTemplate, htmlContent: e.target.value })
                  }
                />
              </div>

              <div className="space-y-2">
                <Label>Plain Text Version (Optional)</Label>
                <Textarea
                  className="h-24"
                  placeholder="Plain text fallback..."
                  value={editingTemplate?.textContent || newTemplate.textContent}
                  onChange={(e) =>
                    editingTemplate
                      ? setEditingTemplate({ ...editingTemplate, textContent: e.target.value })
                      : setNewTemplate({ ...newTemplate, textContent: e.target.value })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setEditingTemplate(null);
                resetNewTemplate();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() =>
                editingTemplate
                  ? updateMutation.mutate({ id: editingTemplate.id, data: editingTemplate })
                  : createMutation.mutate(newTemplate)
              }
              disabled={
                createMutation.isPending ||
                updateMutation.isPending ||
                !(editingTemplate?.name || newTemplate.name) ||
                !(editingTemplate?.subject || newTemplate.subject)
              }
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingTemplate ? "Update Template" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!showPreviewDialog} onOpenChange={() => setShowPreviewDialog(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Preview: {showPreviewDialog?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-2 bg-muted rounded">
              <span className="text-sm font-medium">Subject:</span>{" "}
              <span>{showPreviewDialog?.subject}</span>
            </div>
            <div className="border rounded-lg overflow-hidden">
              <iframe
                title="Email Preview"
                srcDoc={sanitizeHtmlForIframePreview(showPreviewDialog?.htmlContent || "")}
                className="w-full h-96"
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!showDeleteDialog} onOpenChange={() => setShowDeleteDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this template. Transactional emails using this template will
              fall back to the default template for the event type.
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
    </div>
  );
}
