import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageShell } from "@/components/patterns/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Plus, Settings, Eye, Copy, Trash2, ExternalLink,
  FormInput, FileText, Link as LinkIcon
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { LeadFormBuilderDialog } from "@/components/lead-forms/lead-form-builder-dialog";

interface LeadForm {
  id: string;
  name: string;
  description?: string;
  pipelineId: string;
  pipelineName?: string;
  defaultStage: string;
  requiredFields: string[];
  customFields?: Record;
  active: boolean;
  thankYouMessage?: string;
  redirectUrl?: string;
  assetUrl?: string;
  createdAt: string;
}

export default function LeadFormsPage() {
  const { toast } = useToast();
  const [builderDialogOpen, setBuilderDialogOpen] = useState(false);
  const [selectedForm, setSelectedForm] = useState();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formToDelete, setFormToDelete] = useState(null);

  // Fetch all lead forms
  const { data: leadForms = [], isLoading } = useQuery({
    queryKey: ["/api/lead-forms"],
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (formId: string) => {
      return await apiRequest("DELETE", `/api/lead-forms/${formId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lead-forms"] });
      toast({
        title: "Form deleted",
        description: "Lead form has been deleted successfully",
      });
      setDeleteDialogOpen(false);
      setFormToDelete(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete lead form",
        variant: "destructive",
      });
    },
  });

  const handleCreateForm = () => {
    setSelectedForm(undefined);
    setBuilderDialogOpen(true);
  };

  const handleEditForm = (form: LeadForm) => {
    setSelectedForm(form);
    setBuilderDialogOpen(true);
  };

  const handleDeleteForm = (form: LeadForm) => {
    setFormToDelete(form);
    setDeleteDialogOpen(true);
  };

  const handleCopyEmbedUrl = (formId: string) => {
    const embedUrl = `${window.location.origin}/public/lead-forms/${formId}`;
    navigator.clipboard.writeText(embedUrl);
    toast({
      title: "URL copied",
      description: "Form URL has been copied to clipboard",
    });
  };

  const handlePreviewForm = (formId: string) => {
    window.open(`/public/lead-forms/${formId}`, '_blank');
  };

  return (
    
      
        {/* Header Actions */}
        
          
            
              {leadForms.length} {leadForms.length === 1 ? 'Form' : 'Forms'}
            
          
          
            
            Create Form
          
        

        {/* Forms Table */}
        
          
            All Forms
            
              Manage your lead capture forms and embed them on external websites
            
          
          
            {isLoading ? (
              
                Loading forms...
              
            ) : leadForms.length === 0 ? (
              
                
                
                  No lead forms yet. Create your first form to start capturing leads.
                
                
                  
                  Create Your First Form
                
              
            ) : (
              
                
                  
                    Name
                    Pipeline
                    Stage
                    Required Fields
                    Status
                    Actions
                  
                
                
                  {leadForms.map((form) => (
                    
                      
                        
                          {form.name}
                          {form.description && (
                            
                              {form.description}
                            
                          )}
                        
                      
                      
                        
                          {form.pipelineName || form.pipelineId}
                        
                      
                      
                        
                          {form.defaultStage}
                        
                      
                      
                        
                          {form.requiredFields.slice(0, 3).map((field) => (
                            
                              {field}
                            
                          ))}
                          {form.requiredFields.length > 3 && (
                            
                              +{form.requiredFields.length - 3}
                            
                          )}
                        
                      
                      
                        
                          {form.active ? "Active" : "Inactive"}
                        
                      
                      
                        
                          
                            
                              
                            
                          
                          
                             handleEditForm(form)}
                              data-testid={`menuitem-edit-${form.id}`}
                            >
                              
                              Edit Form
                            
                             handlePreviewForm(form.id)}
                              data-testid={`menuitem-preview-${form.id}`}
                            >
                              
                              Preview
                            
                             handleCopyEmbedUrl(form.id)}
                              data-testid={`menuitem-copy-url-${form.id}`}
                            >
                              
                              Copy URL
                            
                             handleDeleteForm(form)}
                              className="text-destructive"
                              data-testid={`menuitem-delete-${form.id}`}
                            >
                              
                              Delete
                            
                          
                        
                      
                    
                  ))}
                
              
            )}
          
        
      

      {/* Lead Form Builder Dialog */}
      

      {/* Delete Confirmation Dialog */}
      
        
          
            Delete Lead Form?
            
              Are you sure you want to delete "{formToDelete?.name}"? This action cannot be undone.
              Existing submissions will not be affected.
            
          
          
            
              Cancel
            
             formToDelete && deleteMutation.mutate(formToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete Form
            
          
        
      
    
  );
}