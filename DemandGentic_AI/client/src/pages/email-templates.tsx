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

type TemplateFormData = z.infer;

export default function EmailTemplatesPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const searchParams = new URLSearchParams(searchString);
  const campaignId = searchParams.get('campaignId');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [activeTab, setActiveTab] = useState("edit");
  const [isEditorPreviewExpanded, setIsEditorPreviewExpanded] = useState(false);
  const [isTemplatePreviewExpanded, setIsTemplatePreviewExpanded] = useState(false);
  const [selectedMergeToken, setSelectedMergeToken] = useState(undefined);

  const activeEditorRef = useRef(null);

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
  const { data: templates = [], isLoading } = useQuery({
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
      
        
          
            
            Campaign Context Required
            
              
                Email templates are now campaign-bound. Templates must be created
                within the context of a specific campaign to ensure messaging consistency and
                strategic alignment.
              
              
                This change ensures that:
              
              
                Templates are tied to specific campaigns and clients
                Email content aligns with campaign objectives
                No orphaned or misaligned templates exist
                All email generation uses the same strategic framework
              
               setLocation("/campaigns")}
                className="mt-2"
              >
                
                Go to Campaigns
              
            
          

          
            
              How to Create Email Templates
              
                Follow these steps to create campaign-specific email templates
              
            
            
              
                1
                
                  Navigate to Campaigns
                  Go to the Campaigns hub to view all your campaigns
                
              
              
                2
                
                  Select or Create a Campaign
                  Choose an existing email campaign or create a new one
                
              
              
                3
                
                  Create Templates Within Campaign
                  
                    Use the campaign editor to create and manage email templates that are
                    automatically aligned with your campaign's objectives and strategy
                  
                
              
            
          
        
      
    );
  }

  const form = useForm({
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
    
      
        
          
            Email Templates
            
              Create reusable email templates with personalization tokens
            
          
          
            
            Create Template
          
        

        {isLoading ? (
          
            {[1, 2, 3].map((i) => (
              
                
                  
                  
                
              
            ))}
          
        ) : templates.length === 0 ? (
          
            
              
              
                No email templates yet. Create your first template to get started.
              
            
          
        ) : (
          
            {templates.map((template) => (
              
                
                  
                    
                      {template.name}
                      {template.description && (
                        {template.description}
                      )}
                    
                    
                      {template.isActive ? "Active" : "Inactive"}
                    
                  
                
                
                  
                    
                      Subject:
                      {template.subject}
                    
                    {template.category && (
                      
                        
                        {template.category}
                      
                    )}
                  
                
                
                
                   handleEdit(template)}
                    data-testid={`button-edit-${template.id}`}
                  >
                    
                    Edit
                  
                   handlePreview(template)}
                    data-testid={`button-preview-${template.id}`}
                  >
                    
                    Preview
                  
                   handleDuplicate(template)}
                    data-testid={`button-duplicate-${template.id}`}
                  >
                    
                    Duplicate
                  
                
              
            ))}
          
        )}
      

      {/* Create/Edit Dialog */}
      
        
          
            
              {selectedTemplate ? "Edit Email Template" : "Create Email Template"}
            
            
              Create Outlook-safe email templates with personalization tokens like{" "}
              {"{{firstName}}"},{" "}
              {"{{companyName}}"}, etc.
            
          

          
            
              
                 (
                    
                      Template Name *
                      
                        
                      
                      
                    
                  )}
                />

                 (
                    
                      Category
                      
                        
                          
                            
                          
                        
                        
                          Sales
                          Marketing
                          Follow-up
                          Onboarding
                          Support
                        
                      
                      
                    
                  )}
                />
              

               (
                  
                    Description
                    
                      
                    
                    
                  
                )}
              />

               (
                  
                    Subject Line *
                    
                      
                    
                    
                      
                         insertTokenSubject("firstName")}
                        >
                          + First Name
                        
                         insertTokenSubject("lastName")}
                        >
                          + Last Name
                        
                         insertTokenSubject("companyName")}
                        >
                          + Company
                        
                      
                    
                    
                  
                )}
              />

              
                
                  Edit
                  Preview
                

                
                   (
                      
                        HTML Content *
                        
                          
                             {
                                setSelectedMergeToken(undefined);
                                insertToken(value);
                              }}
                            >
                              
                                
                              
                              
                                
                                  First Name {{firstName}}
                                
                                
                                  Last Name {{lastName}}
                                
                                
                                  Company {{companyName}}
                                
                                
                                  Job Title {{jobTitle}}
                                
                              
                            
                            
                              Click inside the editor first.
                            
                          
                        
                        
                          Hi {{firstName}},Welcome to {{companyName}}!"
                            className="font-mono text-sm"
                            data-testid="textarea-html-content"
                            onFocus={(event) => captureHtmlSelection(event.currentTarget)}
                            onClick={(event) => captureHtmlSelection(event.currentTarget)}
                            onKeyUp={(event) => captureHtmlSelection(event.currentTarget)}
                            onSelect={(event) => captureHtmlSelection(event.currentTarget)}
                          />
                        
                        
                      
                    )}
                  />

                   (
                      
                        Plain Text Fallback
                        
                          
                        
                        
                          Optional plain text version for email clients that don't support HTML
                        
                        
                      
                    )}
                  />
                

                
                  
                    Live preview
                     setIsEditorPreviewExpanded((prev) => !prev)}
                    >
                      {isEditorPreviewExpanded ? (
                        <>
                          
                          Compact
                        
                      ) : (
                        <>
                          
                          Full width
                        
                      )}
                    
                  
                  
                    
                      Subject:
                      {form.watch("subject")}
                    
                    
                    No content yet..." }}
                    />
                  
                
              

              
                 setDialogOpen(false)}>
                  Cancel
                
                
                  {selectedTemplate ? "Update Template" : "Create Template"}
                
              
            
          
        
      

      {/* Preview Dialog */}
      
        
          
            
              
                {previewTemplate?.name}
                {previewTemplate?.description}
              
               setIsTemplatePreviewExpanded((prev) => !prev)}
              >
                {isTemplatePreviewExpanded ? (
                  <>
                    
                    Compact
                  
                ) : (
                  <>
                    
                    Full width
                  
                )}
              
            
          

          {previewTemplate && (
            
              
                Subject:
                {previewTemplate.subject}
              
              
              {previewTemplate.category && (
                
                  
                  {previewTemplate.category}
                
              )}

              

              
                HTML Content:
                
              

              {previewTemplate.plainTextContent && (
                <>
                  
                  
                    Plain Text Version:
                    
                      {previewTemplate.plainTextContent}
                    
                  
                
              )}
            
          )}

          
             setPreviewOpen(false)}>
              Close
            
            {previewTemplate && (
               {
                setPreviewOpen(false);
                handleEdit(previewTemplate);
              }}>
                
                Edit Template
              
            )}
          
        
      
    
  );
}