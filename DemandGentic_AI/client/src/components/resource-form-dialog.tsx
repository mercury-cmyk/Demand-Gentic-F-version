import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Resource } from "@shared/schema";

const resourceFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  resourceType: z.enum(["ebook", "infographic", "white_paper", "guide", "case_study"]),
  community: z.enum(["hr", "finance", "marketing", "it", "cx_ux", "data_ai", "ops"]),
  overviewHtml: z.string().optional(),
  bodyHtml: z.string().optional(),
  thumbnailUrl: z.string().url().optional().or(z.literal("")),
  ctaLink: z.string().url().optional().or(z.literal("")),
  formId: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

type ResourceFormData = z.infer;

interface ResourceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource?: Resource;
}

export function ResourceFormDialog({ open, onOpenChange, resource }: ResourceFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!resource;

  const form = useForm({
    resolver: zodResolver(resourceFormSchema),
    defaultValues: {
      title: resource?.title || "",
      slug: resource?.slug || "",
      resourceType: resource?.resourceType || "ebook",
      community: resource?.community || "marketing",
      overviewHtml: resource?.overviewHtml || "",
      bodyHtml: resource?.bodyHtml || "",
      thumbnailUrl: resource?.thumbnailUrl || "",
      ctaLink: resource?.ctaLink || "",
      formId: resource?.formId || "",
      status: resource?.status || "draft",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: ResourceFormData) => {
      return await apiRequest("/api/resources", "POST", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      toast({
        title: "Resource created",
        description: "The resource has been successfully created.",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create resource.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ResourceFormData) => {
      return await apiRequest(`/api/resources/${resource?.id}`, "PUT", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/resources"] });
      toast({
        title: "Resource updated",
        description: "The resource has been successfully updated.",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update resource.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: ResourceFormData) => {
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    
      
        
          {isEdit ? "Edit Resource" : "Create Resource"}
          
            {isEdit ? "Update the resource details below." : "Fill in the details to create a new resource."}
          
        
        
          
            
               (
                  
                    Title
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    Slug
                    
                      
                    
                    
                  
                )}
              />
            

            
               (
                  
                    Resource Type
                    
                      
                        
                          
                        
                      
                      
                        eBook
                        Infographic
                        White Paper
                        Guide
                        Case Study
                      
                    
                    
                  
                )}
              />
               (
                  
                    Community
                    
                      
                        
                          
                        
                      
                      
                        HR
                        Finance
                        Marketing
                        IT
                        CX/UX
                        Data/AI
                        Ops
                      
                    
                    
                  
                )}
              />
            

             (
                
                  Overview (Optional)
                  
                    
                  
                  
                
              )}
            />

             (
                
                  Body (Optional)
                  
                    
                  
                  
                
              )}
            />

            
               (
                  
                    Thumbnail URL (Optional)
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    CTA Link (Optional)
                    
                      
                    
                    
                  
                )}
              />
            

            
               (
                  
                    Form ID (Optional)
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    Status
                    
                      
                        
                          
                        
                      
                      
                        Draft
                        Published
                        Archived
                      
                    
                    
                  
                )}
              />
            

            
               onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              
              
                {isEdit ? "Update" : "Create"} Resource
              
            
          
        
      
    
  );
}