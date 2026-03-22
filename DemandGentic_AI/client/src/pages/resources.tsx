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
  const [editResource, setEditResource] = useState(undefined);

  const { data: resources = [], isLoading } = useQuery({
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
      
        
          
          Resources
        
        Loading resources...
      
    );
  }

  return (
    
      
        
          
          Resources
        
         setCreateDialogOpen(true)} data-testid="button-create-resource">
          
          Create Resource
        
      

      {resources.length === 0 ? (
        
          
            
              
              No resources yet
              
                Create your first resource to get started
              
               setCreateDialogOpen(true)} data-testid="button-create-first-resource">
                
                Create Resource
              
            
          
        
      ) : (
        
          {resources.map((resource) => (
            
              
                
                  
                    
                      {resource.title}
                      
                        {resource.resourceType}
                      
                      {resource.status && (
                        
                          {resource.status}
                        
                      )}
                      {resource.formId && (
                        
                          
                          Gated
                        
                      )}
                    
                    {resource.overviewHtml && (
                      {resource.overviewHtml.substring(0, 150)}...
                    )}
                  
                  
                     setEditResource(resource)}
                      data-testid={`button-edit-${resource.id}`}
                    >
                      
                    
                     deleteMutation.mutate(resource.id)}
                      data-testid={`button-delete-${resource.id}`}
                    >
                      
                    
                  
                
              
              
                
                  {resource.ctaLink && (
                    
                      
                      
                        Download Link
                      
                    
                  )}
                  {resource.formId && (
                    
                      Form: {resource.formId}
                    
                  )}
                  
                    
                    
                      {resource.community}
                    
                  
                
              
            
          ))}
        
      )}

      
      
       !open && setEditResource(undefined)}
        resource={editResource}
      />
    
  );
}