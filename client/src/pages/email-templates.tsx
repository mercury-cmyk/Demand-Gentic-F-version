/**
 * Email Templates Page
 *
 * IMPORTANT: Email templates are CAMPAIGN-BOUND.
 *
 * This page now requires a campaign context. Templates cannot be created
 * as standalone/global assets - they must be associated with a specific campaign.
 *
 * If accessed without a campaign context, users are redirected to the campaigns hub.
 */
import { useRef, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useLocation, useSearch } from "wouter";
import { Plus, Eye, Copy, Trash, Edit, Mail, Tag, Maximize2, Minimize2, AlertTriangle, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { EmailTemplate } from "@shared/schema";
import { insertEmailTemplateSchema } from "@shared/schema";

const templateFormSchema = insertEmailTemplateSchema.extend({
  name: z.string().min(1, "Template name is required"),
  subject: z.string().min(1, "Subject is required"),
  htmlContent: z.string().min(1, "Email content is required"),
});

type TemplateFormData = z.infer<typeof templateFormSchema>;

export default function EmailTemplatesPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const campaignId = searchParams.get('campaignId');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [activeTab, setActiveTab] = useState("edit");
  const [isEditorPreviewExpanded, setIsEditorPreviewExpanded] = useState(false);
  const [isTemplatePreviewExpanded, setIsTemplatePreviewExpanded] = useState(false);
  const [selectedMergeToken, setSelectedMergeToken] = useState<string | undefined>(undefined);

  const activeEditorRef = useRef<{
    selectionStart?: number;
    selectionEnd?: number;
  } | null>(null);

  // Fetch campaign details if campaignId is provided
  const { data: campaign } = useQuery({
    queryKey: ["/api/campaigns", campaignId],
    queryFn: async () => {
      if (!campaignId) return null;
      const response = await fetch(`/api/campaigns/${campaignId}`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!campaignId,
  });

  // Fetch templates - filter by campaign if provided
  const { data: templates = [], isLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email-templates", campaignId],
    queryFn: async () => {
      const url = campaignId
        ? `/api/email-templates?campaignId=${campaignId}`
        : "/api/email-templates";
      const response = await fetch(url);
      if (!response.ok) throw new Error("Failed to fetch templates");
      return response.json();
    },
  });

  // If no campaign context, show a notice redirecting to campaigns
  if (!campaignId) {
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto p-6 space-y-6">
          <Alert variant="default" className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/20">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <AlertTitle className="text-amber-800 dark:text-amber-200">Campaign Context Required</AlertTitle>
            <AlertDescription className="text-amber-700 dark:text-amber-300 mt-2">
              <p className="mb-4">
                Email templates are now <strong>campaign-bound</strong>. Templates must be created
                within the context of a specific campaign to ensure messaging consistency and
                strategic alignment.
              </p>
              <p className="mb-4">
                This change ensures that:
              </p>
              <ul className="list-disc list-inside mb-4 space-y-1">
                <li>Templates are tied to specific campaigns and clients</li>
                <li>Email content aligns with campaign objectives</li>
                <li>No orphaned or misaligned templates exist</li>
                <li>All email generation uses the same strategic framework</li>
              </ul>
              <Button
                onClick={() => setLocation("/campaigns")}
                className="mt-2"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Go to Campaigns
              </Button>
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle>How to Create Email Templates</CardTitle>
              <CardDescription>
                Follow these steps to create campaign-specific email templates
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="mt-0.5">1</Badge>
                <div>
                  <p className="font-medium">Navigate to Campaigns</p>
                  <p className="text-sm text-muted-foreground">Go to the Campaigns hub to view all your campaigns</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="mt-0.5">2</Badge>
                <div>
                  <p className="font-medium">Select or Create a Campaign</p>
                  <p className="text-sm text-muted-foreground">Choose an existing email campaign or create a new one</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <Badge variant="outline" className="mt-0.5">3</Badge>
                <div>
                  <p className="font-medium">Create Templates Within Campaign</p>
                  <p className="text-sm text-muted-foreground">
                    Use the campaign editor to create and manage email templates that are
                    automatically aligned with your campaign's objectives and strategy
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const form = useForm<TemplateFormData>({
    resolver: zodResolver(templateFormSchema),
    defaultValues: {
      name: "",
      description: "",
      subject: "",
      htmlContent: "",
      plainTextContent: "",
      category: "",
      isActive: true,
      createdBy: "",
    },
  });

  const handleCreate = () => {
    setSelectedTemplate(null);
    form.reset({
      name: "",
      description: "",
      subject: "",
      htmlContent: "",
      plainTextContent: "",
      category: "",
      isActive: true,
      createdBy: "",
    });
    setDialogOpen(true);
  };

  const handleEdit = (template: EmailTemplate) => {
    setSelectedTemplate(template);
    form.reset({
      name: template.name,
      description: template.description || "",
      subject: template.subject,
      htmlContent: template.htmlContent,
      plainTextContent: template.plainTextContent || "",
      category: template.category || "",
      isActive: template.isActive,
      createdBy: template.createdBy || "",
    });
    setDialogOpen(true);
  };

  const handlePreview = (template: EmailTemplate) => {
    setPreviewTemplate(template);
    setPreviewOpen(true);
  };

  const handleDuplicate = async (template: EmailTemplate) => {
    try {
      await apiRequest("POST", "/api/email-templates", {
        name: `${template.name} (Copy)`,
        description: template.description,
        subject: template.subject,
        htmlContent: template.htmlContent,
        plainTextContent: template.plainTextContent,
        category: template.category,
        isActive: false, // Start inactive
        createdBy: template.createdBy,
      });
      
      await queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      
      toast({
        title: "Template duplicated",
        description: "The template has been duplicated successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to duplicate template",
        variant: "destructive",
      });
    }
  };

  const onSubmit = async (data: TemplateFormData) => {
    try {
      if (selectedTemplate) {
        await apiRequest("PATCH", `/api/email-templates/${selectedTemplate.id}`, data);
        toast({
          title: "Template updated",
          description: "Email template has been updated successfully.",
        });
      } else {
        await apiRequest("POST", "/api/email-templates", data);
        toast({
          title: "Template created",
          description: "New email template has been created successfully.",
        });
      }

      await queryClient.invalidateQueries({ queryKey: ["/api/email-templates"] });
      setDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save template",
        variant: "destructive",
      });
    }
  };

  const insertToken = (token: string) => {
    const currentContent = form.getValues("htmlContent");
    const selectionStart = activeEditorRef.current?.selectionStart ?? currentContent.length;
    const selectionEnd = activeEditorRef.current?.selectionEnd ?? currentContent.length;
    const updated =
      currentContent.slice(0, selectionStart) + `{{${token}}}` + currentContent.slice(selectionEnd);
    form.setValue("htmlContent", updated);
  };

  const insertTokenSubject = (token: string) => {
    const currentSubject = form.getValues("subject");
    form.setValue("subject", currentSubject + `{{${token}}}`);
  };

  const captureHtmlSelection = (target: HTMLTextAreaElement) => {
    activeEditorRef.current = {
      selectionStart: target.selectionStart ?? target.value.length,
      selectionEnd: target.selectionEnd ?? target.value.length,
    };
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Email Templates</h1>
            <p className="text-muted-foreground mt-1">
              Create reusable email templates with personalization tokens
            </p>
          </div>
          <Button onClick={handleCreate} data-testid="button-create-template">
            <Plus className="w-4 h-4 mr-2" />
            Create Template
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader>
                  <div className="h-6 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2 mt-2" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : templates.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Mail className="w-12 h-12 text-muted-foreground mb-4" />
              <p className="text-muted-foreground text-center">
                No email templates yet. Create your first template to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <Card key={template.id} data-testid={`card-template-${template.id}`}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      {template.description && (
                        <CardDescription className="mt-1">{template.description}</CardDescription>
                      )}
                    </div>
                    <Badge variant={template.isActive ? "default" : "secondary"}>
                      {template.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 text-sm">
                    <div>
                      <span className="font-medium">Subject:</span>
                      <p className="text-muted-foreground truncate">{template.subject}</p>
                    </div>
                    {template.category && (
                      <div className="flex items-center gap-2">
                        <Tag className="w-3 h-3" />
                        <span className="text-muted-foreground">{template.category}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
                <Separator />
                <CardFooter className="flex gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(template)}
                    data-testid={`button-edit-${template.id}`}
                  >
                    <Edit className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePreview(template)}
                    data-testid={`button-preview-${template.id}`}
                  >
                    <Eye className="w-3 h-3 mr-1" />
                    Preview
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDuplicate(template)}
                    data-testid={`button-duplicate-${template.id}`}
                  >
                    <Copy className="w-3 h-3 mr-1" />
                    Duplicate
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={`${isEditorPreviewExpanded ? "max-w-6xl" : "max-w-4xl"} max-h-[90vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle>
              {selectedTemplate ? "Edit Email Template" : "Create Email Template"}
            </DialogTitle>
            <DialogDescription>
              Create Outlook-safe email templates with personalization tokens like{" "}
              <code className="bg-muted px-1">{"{{firstName}}"}</code>,{" "}
              <code className="bg-muted px-1">{"{{companyName}}"}</code>, etc.
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Template Name *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Welcome Email" data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || ""}>
                        <FormControl>
                          <SelectTrigger data-testid="select-category">
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Sales">Sales</SelectItem>
                          <SelectItem value="Marketing">Marketing</SelectItem>
                          <SelectItem value="Follow-up">Follow-up</SelectItem>
                          <SelectItem value="Onboarding">Onboarding</SelectItem>
                          <SelectItem value="Support">Support</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ""} placeholder="Brief description of this template" data-testid="input-description" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Subject Line *</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="Welcome to {{companyName}}" data-testid="input-subject" />
                    </FormControl>
                    <FormDescription>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => insertTokenSubject("firstName")}
                        >
                          + First Name
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => insertTokenSubject("lastName")}
                        >
                          + Last Name
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => insertTokenSubject("companyName")}
                        >
                          + Company
                        </Button>
                      </div>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                </TabsList>

                <TabsContent value="edit" className="space-y-4">
                  <FormField
                    control={form.control}
                    name="htmlContent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>HTML Content *</FormLabel>
                        <FormDescription>
                          <div className="flex flex-wrap gap-2 mb-2">
                            <Select
                              value={selectedMergeToken}
                              onValueChange={(value) => {
                                setSelectedMergeToken(undefined);
                                insertToken(value);
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Insert merge field at cursor..." />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="firstName" className="text-xs">
                                  First Name {{firstName}}
                                </SelectItem>
                                <SelectItem value="lastName" className="text-xs">
                                  Last Name {{lastName}}
                                </SelectItem>
                                <SelectItem value="companyName" className="text-xs">
                                  Company {{companyName}}
                                </SelectItem>
                                <SelectItem value="jobTitle" className="text-xs">
                                  Job Title {{jobTitle}}
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            <span className="text-xs text-muted-foreground">
                              Click inside the editor first.
                            </span>
                          </div>
                        </FormDescription>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={12}
                            placeholder="<p>Hi {{firstName}},</p><p>Welcome to {{companyName}}!</p>"
                            className="font-mono text-sm"
                            data-testid="textarea-html-content"
                            onFocus={(event) => captureHtmlSelection(event.currentTarget)}
                            onClick={(event) => captureHtmlSelection(event.currentTarget)}
                            onKeyUp={(event) => captureHtmlSelection(event.currentTarget)}
                            onSelect={(event) => captureHtmlSelection(event.currentTarget)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="plainTextContent"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Plain Text Fallback</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            value={field.value || ""}
                            rows={6}
                            placeholder="Plain text version for email clients that don't support HTML"
                            data-testid="textarea-plain-text"
                          />
                        </FormControl>
                        <FormDescription>
                          Optional plain text version for email clients that don't support HTML
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </TabsContent>

                <TabsContent value="preview">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm text-muted-foreground">Live preview</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsEditorPreviewExpanded((prev) => !prev)}
                    >
                      {isEditorPreviewExpanded ? (
                        <>
                          <Minimize2 className="w-4 h-4 mr-2" />
                          Compact
                        </>
                      ) : (
                        <>
                          <Maximize2 className="w-4 h-4 mr-2" />
                          Full width
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="border rounded-lg p-6 bg-card min-h-[300px]">
                    <div className="mb-4">
                      <Label className="text-sm font-medium">Subject:</Label>
                      <p className="text-lg font-semibold">{form.watch("subject")}</p>
                    </div>
                    <Separator className="my-4" />
                    <div
                      className="prose max-w-none"
                      dangerouslySetInnerHTML={{ __html: form.watch("htmlContent") || "<p class='text-muted-foreground'>No content yet...</p>" }}
                    />
                  </div>
                </TabsContent>
              </Tabs>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" data-testid="button-save-template">
                  {selectedTemplate ? "Update Template" : "Create Template"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className={`${isTemplatePreviewExpanded ? "max-w-6xl" : "max-w-3xl"} max-h-[90vh] overflow-y-auto`}>
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle>{previewTemplate?.name}</DialogTitle>
                <DialogDescription>{previewTemplate?.description}</DialogDescription>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsTemplatePreviewExpanded((prev) => !prev)}
              >
                {isTemplatePreviewExpanded ? (
                  <>
                    <Minimize2 className="w-4 h-4 mr-2" />
                    Compact
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-4 h-4 mr-2" />
                    Full width
                  </>
                )}
              </Button>
            </div>
          </DialogHeader>

          {previewTemplate && (
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Subject:</Label>
                <p className="text-lg font-semibold mt-1">{previewTemplate.subject}</p>
              </div>
              
              {previewTemplate.category && (
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4" />
                  <Badge>{previewTemplate.category}</Badge>
                </div>
              )}

              <Separator />

              <div>
                <Label className="text-sm font-medium mb-2 block">HTML Content:</Label>
                <div
                  className="border rounded-lg p-6 bg-card prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: previewTemplate.htmlContent }}
                />
              </div>

              {previewTemplate.plainTextContent && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Plain Text Version:</Label>
                    <pre className="border rounded-lg p-4 bg-muted text-sm whitespace-pre-wrap">
                      {previewTemplate.plainTextContent}
                    </pre>
                  </div>
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Close
            </Button>
            {previewTemplate && (
              <Button onClick={() => {
                setPreviewOpen(false);
                handleEdit(previewTemplate);
              }}>
                <Edit className="w-4 h-4 mr-2" />
                Edit Template
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
