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
  variables?: Array;
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

const DEFAULT_HTML_TEMPLATE = `


  
  


  
    
      
        
          
            
              {{title}}
              
                {{message}}
              
              {{#if actionUrl}}
              
                
                  
                    
                      {{actionLabel}}
                    
                  
                
              
              {{/if}}
            
          
          
            
              
                DemandGentic - Enterprise Email Infrastructure
              
            
          
        
      
    
  

`;

export default function TransactionalTemplatesPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("templates");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterEventType, setFilterEventType] = useState(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(null);
  const [showPreviewDialog, setShowPreviewDialog] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [previewVariables, setPreviewVariables] = useState>({});

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
    variables: [] as Array,
  });

  // Fetch templates
  const { data: templates = [], isLoading: loadingTemplates } = useQuery({
    queryKey: ["/api/communications/templates", filterEventType],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filterEventType) params.set("eventType", filterEventType);
      const res = await apiRequest("GET", `/api/communications/templates?${params}`);
      return res.json();
    },
  });

  // Fetch SMTP providers
  const { data: smtpProviders = [] } = useQuery({
    queryKey: ["/api/communications/smtp-providers"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/communications/smtp-providers");
      return res.json();
    },
  });

  // Fetch logs
  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: ["/api/communications/templates/logs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/communications/templates/logs?limit=50");
      return res.json();
    },
    enabled: activeTab === "logs",
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ["/api/communications/templates/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/communications/templates/stats");
      return res.json();
    },
  });

  // Create template mutation
  const createMutation = useMutation({
    mutationFn: async (data: typeof newTemplate) => {
      const res = await apiRequest("POST", "/api/communications/templates", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications/templates"] });
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
    mutationFn: async ({ id, data }: { id: string; data: Partial }) => {
      const res = await apiRequest("PUT", `/api/communications/templates/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications/templates"] });
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
      const res = await apiRequest("DELETE", `/api/communications/templates/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications/templates"] });
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
      const res = await apiRequest("POST", `/api/communications/templates/${id}/duplicate`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/communications/templates"] });
      toast({ title: "Template duplicated", description: "A copy has been created." });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // Preview mutation
  const previewMutation = useMutation({
    mutationFn: async ({ id, variables }: { id: string; variables: Record }) => {
      const res = await apiRequest("POST", `/api/communications/templates/${id}/preview`, { variables });
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
        return Sent;
      case "failed":
      case "bounced":
        return Failed;
      case "pending":
      case "queued":
      case "sending":
        return Pending;
      default:
        return {status};
    }
  };

  if (loadingTemplates) {
    return (
      
        
        
          {[1, 2, 3].map((i) => (
            
          ))}
        
      
    );
  }

  return (
    
      {/* Header */}
      
        
          Transactional Emails
          
            Manage templates for event-triggered transactional emails
          
        
         setShowCreateDialog(true)}>
          
          Create Template
        
      

      {/* Stats Cards */}
      {stats && (
        
          
            
              {stats.total || 0}
              Total Sent (30d)
            
          
          
            
              {stats.sent + stats.delivered || 0}
              Delivered
            
          
          
            
              {stats.failed || 0}
              Failed
            
          
          
            
              {stats.pending || 0}
              Pending
            
          
        
      )}

      {/* Tabs */}
      
        
          Templates
          Send Logs
        

        
          {/* Filters */}
          
            
              
               setSearchQuery(e.target.value)}
              />
            
             setFilterEventType(v === "all" ? null : v)}>
              
                
                
              
              
                All Event Types
                {EVENT_TYPES.map((et) => (
                  
                    {et.label}
                  
                ))}
              
            
          

          {/* Templates Grid */}
          {filteredTemplates.length === 0 ? (
            
              
                
                No Templates Found
                
                  {searchQuery || filterEventType
                    ? "No templates match your filters"
                    : "Create your first transactional email template"}
                
                 setShowCreateDialog(true)}>
                  
                  Create Template
                
              
            
          ) : (
            
              {filteredTemplates.map((template) => (
                
                  
                    
                      
                        
                          {template.name}
                          {template.isDefault && }
                        
                        {getEventTypeLabel(template.eventType)}
                      
                      
                        
                          
                            
                          
                        
                        
                           setEditingTemplate(template)}>
                            
                            Edit
                          
                           setShowPreviewDialog(template)}>
                            
                            Preview
                          
                           duplicateMutation.mutate(template.id)}>
                            
                            Duplicate
                          
                          
                           setShowDeleteDialog(template.id)}
                          >
                            
                            Delete
                          
                        
                      
                    
                  
                  
                    
                      {template.isActive ? (
                        Active
                      ) : (
                        Inactive
                      )}
                      v{template.version}
                    

                    
                      Subject:
                      {template.subject}
                    

                    {template.variables && template.variables.length > 0 && (
                      
                        {template.variables.length} variable(s):{" "}
                        {template.variables.map((v) => v.name).join(", ")}
                      
                    )}

                    
                      Updated: {format(new Date(template.updatedAt), "MMM d, yyyy")}
                    
                  
                
              ))}
            
          )}
        

        
          {loadingLogs ? (
            
              {[1, 2, 3, 4, 5].map((i) => (
                
              ))}
            
          ) : logs.length === 0 ? (
            
              
                
                No Send History
                
                  Transactional email logs will appear here
                
              
            
          ) : (
            
              
                
                  
                    {logs.map((log: any) => (
                      
                        
                          
                            {log.recipientEmail}
                            {getStatusBadge(log.status)}
                          
                          
                            {log.subject}
                          
                          
                            {getEventTypeLabel(log.eventType)} •{" "}
                            {format(new Date(log.createdAt), "MMM d, yyyy h:mm a")}
                          
                        
                        {log.errorMessage && (
                          
                            {log.errorMessage}
                          
                        )}
                      
                    ))}
                  
                
              
            
          )}
        
      

      {/* Create/Edit Template Dialog */}
       {
          if (!open) {
            setShowCreateDialog(false);
            setEditingTemplate(null);
            resetNewTemplate();
          }
        }}
      >
        
          
            {editingTemplate ? "Edit Template" : "Create Template"}
            
              {editingTemplate
                ? "Update your transactional email template"
                : "Create a new transactional email template for event-triggered emails"}
            
          

          
            {/* Left Column - Settings */}
            
              
                Event Type
                
                    editingTemplate
                      ? setEditingTemplate({ ...editingTemplate, eventType: value })
                      : setNewTemplate({ ...newTemplate, eventType: value })
                  }
                >
                  
                    
                  
                  
                    {EVENT_TYPES.map((et) => (
                      
                        
                          {et.label}
                          {et.description}
                        
                      
                    ))}
                  
                
              

              
                Template Name
                
                    editingTemplate
                      ? setEditingTemplate({ ...editingTemplate, name: e.target.value })
                      : setNewTemplate({ ...newTemplate, name: e.target.value })
                  }
                />
              

              
                Subject Line
                
                    editingTemplate
                      ? setEditingTemplate({ ...editingTemplate, subject: e.target.value })
                      : setNewTemplate({ ...newTemplate, subject: e.target.value })
                  }
                />
              

              
                SMTP Provider (Optional)
                 {
                    const resolved = value === "default" ? "" : value;
                    editingTemplate
                      ? setEditingTemplate({ ...editingTemplate, smtpProviderId: resolved || undefined })
                      : setNewTemplate({ ...newTemplate, smtpProviderId: resolved });
                  }}
                >
                  
                    
                  
                  
                    Use default provider
                    {smtpProviders
                      .filter((p) => p.verificationStatus === "verified")
                      .map((provider) => (
                        
                          {provider.name} ({provider.emailAddress})
                        
                      ))}
                  
                
              

              
                
                  
                      editingTemplate
                        ? setEditingTemplate({ ...editingTemplate, isActive: checked })
                        : setNewTemplate({ ...newTemplate, isActive: checked })
                    }
                  />
                  Active
                
                
                  
                      editingTemplate
                        ? setEditingTemplate({ ...editingTemplate, isDefault: checked })
                        : setNewTemplate({ ...newTemplate, isDefault: checked })
                    }
                  />
                  Default for event type
                
              
            

            {/* Right Column - Content */}
            
              
                HTML Content
                
                    editingTemplate
                      ? setEditingTemplate({ ...editingTemplate, htmlContent: e.target.value })
                      : setNewTemplate({ ...newTemplate, htmlContent: e.target.value })
                  }
                />
              

              
                Plain Text Version (Optional)
                
                    editingTemplate
                      ? setEditingTemplate({ ...editingTemplate, textContent: e.target.value })
                      : setNewTemplate({ ...newTemplate, textContent: e.target.value })
                  }
                />
              
            
          

          
             {
                setShowCreateDialog(false);
                setEditingTemplate(null);
                resetNewTemplate();
              }}
            >
              Cancel
            
            
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
                
              )}
              {editingTemplate ? "Update Template" : "Create Template"}
            
          
        
      

      {/* Preview Dialog */}
       setShowPreviewDialog(null)}>
        
          
            Preview: {showPreviewDialog?.name}
          
          
            
              Subject:{" "}
              {showPreviewDialog?.subject}
            
            
              
            
          
        
      

      {/* Delete Confirmation */}
       setShowDeleteDialog(null)}>
        
          
            Delete Template?
            
              This will permanently delete this template. Transactional emails using this template will
              fall back to the default template for the event type.
            
          
          
            Cancel
             showDeleteDialog && deleteMutation.mutate(showDeleteDialog)}
            >
              {deleteMutation.isPending && }
              Delete
            
          
        
      
    
  );
}