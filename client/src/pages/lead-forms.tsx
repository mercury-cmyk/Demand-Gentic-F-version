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
  customFields?: Record<string, any>;
  active: boolean;
  thankYouMessage?: string;
  redirectUrl?: string;
  assetUrl?: string;
  createdAt: string;
}

export default function LeadFormsPage() {
  const { toast } = useToast();
  const [builderDialogOpen, setBuilderDialogOpen] = useState(false);
  const [selectedForm, setSelectedForm] = useState<LeadForm | undefined>();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formToDelete, setFormToDelete] = useState<LeadForm | null>(null);

  // Fetch all lead forms
  const { data: leadForms = [], isLoading } = useQuery<LeadForm[]>({
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
    <PageShell
      title="Lead Capture Forms"
      description="Create and manage lead capture forms that automatically create pipeline opportunities"
    >
      <div className="space-y-4">
        {/* Header Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {leadForms.length} {leadForms.length === 1 ? 'Form' : 'Forms'}
            </Badge>
          </div>
          <Button 
            onClick={handleCreateForm}
            data-testid="button-create-form"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Form
          </Button>
        </div>

        {/* Forms Table */}
        <Card>
          <CardHeader>
            <CardTitle>All Forms</CardTitle>
            <CardDescription>
              Manage your lead capture forms and embed them on external websites
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading forms...
              </div>
            ) : leadForms.length === 0 ? (
              <div className="text-center py-8">
                <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">
                  No lead forms yet. Create your first form to start capturing leads.
                </p>
                <Button onClick={handleCreateForm} data-testid="button-create-first-form">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Form
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Pipeline</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Required Fields</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leadForms.map((form) => (
                    <TableRow key={form.id} data-testid={`row-form-${form.id}`}>
                      <TableCell className="font-medium">
                        <div>
                          <div className="font-semibold">{form.name}</div>
                          {form.description && (
                            <div className="text-sm text-muted-foreground">
                              {form.description}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {form.pipelineName || form.pipelineId}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {form.defaultStage}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {form.requiredFields.slice(0, 3).map((field) => (
                            <Badge 
                              key={field} 
                              variant="outline"
                              className="text-xs"
                            >
                              {field}
                            </Badge>
                          ))}
                          {form.requiredFields.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{form.requiredFields.length - 3}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={form.active ? "default" : "secondary"}
                          data-testid={`badge-status-${form.id}`}
                        >
                          {form.active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              data-testid={`button-actions-${form.id}`}
                            >
                              <Settings className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={() => handleEditForm(form)}
                              data-testid={`menuitem-edit-${form.id}`}
                            >
                              <Settings className="h-4 w-4 mr-2" />
                              Edit Form
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handlePreviewForm(form.id)}
                              data-testid={`menuitem-preview-${form.id}`}
                            >
                              <Eye className="h-4 w-4 mr-2" />
                              Preview
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleCopyEmbedUrl(form.id)}
                              data-testid={`menuitem-copy-url-${form.id}`}
                            >
                              <LinkIcon className="h-4 w-4 mr-2" />
                              Copy URL
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleDeleteForm(form)}
                              className="text-destructive"
                              data-testid={`menuitem-delete-${form.id}`}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Lead Form Builder Dialog */}
      <LeadFormBuilderDialog
        open={builderDialogOpen}
        onOpenChange={setBuilderDialogOpen}
        form={selectedForm}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Lead Form?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{formToDelete?.name}"? This action cannot be undone.
              Existing submissions will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => formToDelete && deleteMutation.mutate(formToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete Form
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
