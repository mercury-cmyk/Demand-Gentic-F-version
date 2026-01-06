import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, FileText, Download, Lock, Trash2, Edit, Users } from "lucide-react";
import type { Resource } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { ResourceFormDialog } from "@/components/resource-form-dialog";

export default function Resources() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editResource, setEditResource] = useState<Resource | undefined>(undefined);

  const { data: resources = [], isLoading } = useQuery<Resource[]>({
    queryKey: ["/api/resources"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/resources/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      toast({
        title: "Resource deleted",
        description: "The resource has been successfully deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete resource.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <FileText className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Resources</h1>
        </div>
        <div className="text-muted-foreground">Loading resources...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <FileText className="h-6 w-6" />
          <h1 className="text-2xl font-bold">Resources</h1>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-resource">
          <Plus className="h-4 w-4 mr-2" />
          Create Resource
        </Button>
      </div>

      {resources.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No resources yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first resource to get started
              </p>
              <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-resource">
                <Plus className="h-4 w-4 mr-2" />
                Create Resource
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {resources.map((resource) => (
            <Card key={resource.id} data-testid={`card-resource-${resource.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <CardTitle>{resource.title}</CardTitle>
                      <Badge variant="outline" data-testid={`badge-resource-type-${resource.id}`}>
                        {resource.resourceType}
                      </Badge>
                      {resource.status && (
                        <Badge 
                          variant={resource.status === 'published' ? 'default' : 'secondary'}
                          data-testid={`badge-status-${resource.id}`}
                        >
                          {resource.status}
                        </Badge>
                      )}
                      {resource.formId && (
                        <Badge variant="secondary" data-testid={`badge-gated-${resource.id}`}>
                          <Lock className="h-3 w-3 mr-1" />
                          Gated
                        </Badge>
                      )}
                    </div>
                    {resource.overviewHtml && (
                      <CardDescription>{resource.overviewHtml.substring(0, 150)}...</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="icon" 
                      variant="ghost"
                      onClick={() => setEditResource(resource)}
                      data-testid={`button-edit-${resource.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(resource.id)}
                      data-testid={`button-delete-${resource.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  {resource.ctaLink && (
                    <div className="flex items-center gap-2">
                      <Download className="h-4 w-4 text-muted-foreground" />
                      <a 
                        href={resource.ctaLink} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                        data-testid={`link-download-${resource.id}`}
                      >
                        Download Link
                      </a>
                    </div>
                  )}
                  {resource.formId && (
                    <div className="text-muted-foreground" data-testid={`text-form-${resource.id}`}>
                      Form: {resource.formId}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span data-testid={`text-community-${resource.id}`}>
                      {resource.community}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ResourceFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
      
      <ResourceFormDialog
        open={!!editResource}
        onOpenChange={(open) => !open && setEditResource(undefined)}
        resource={editResource}
      />
    </div>
  );
}
