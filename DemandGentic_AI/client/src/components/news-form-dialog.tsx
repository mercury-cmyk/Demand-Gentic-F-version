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
import type { News } from "@shared/schema";

const newsFormSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required").regex(/^[a-z0-9-]+$/, "Slug must be lowercase letters, numbers, and hyphens only"),
  community: z.enum(["hr", "finance", "marketing", "it", "cx_ux", "data_ai", "ops"]),
  overviewHtml: z.string().optional(),
  bodyHtml: z.string().optional(),
  authors: z.string().optional(), // Comma-separated authors
  publishedIso: z.string().optional(),
  thumbnailUrl: z.string().url().optional().or(z.literal("")),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

type NewsFormData = z.infer;

interface NewsFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  news?: News;
}

export function NewsFormDialog({ open, onOpenChange, news }: NewsFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!news;

  const form = useForm({
    resolver: zodResolver(newsFormSchema),
    defaultValues: {
      title: news?.title || "",
      slug: news?.slug || "",
      community: news?.community || "marketing",
      overviewHtml: news?.overviewHtml || "",
      bodyHtml: news?.bodyHtml || "",
      authors: news?.authors?.join(", ") || "",
      publishedIso: news?.publishedIso || "",
      thumbnailUrl: news?.thumbnailUrl || "",
      status: news?.status || "draft",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: NewsFormData) => {
      const authors = data.authors 
        ? data.authors.split(",").map(a => a.trim()).filter(Boolean)
        : [];
      return await apiRequest("/api/news", "POST", { ...data, authors });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/news"] });
      toast({
        title: "News created",
        description: "The news article has been successfully created.",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create news article.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: NewsFormData) => {
      const authors = data.authors 
        ? data.authors.split(",").map(a => a.trim()).filter(Boolean)
        : [];
      return await apiRequest(`/api/news/${news?.id}`, "PUT", { ...data, authors });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/news"] });
      toast({
        title: "News updated",
        description: "The news article has been successfully updated.",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update news article.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: NewsFormData) => {
    if (isEdit) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    
      
        
          {isEdit ? "Edit News" : "Create News"}
          
            {isEdit ? "Update the news article details below." : "Fill in the details to create a new news article."}
          
        
        
          
            
               (
                  
                    Title
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    Slug
                    
                      
                    
                    
                  
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
                
                  Authors (Optional)
                  
                    
                  
                  
                
              )}
            />

            
               (
                  
                    Published Date (Optional)
                    
                      
                    
                    
                  
                )}
              />
               (
                  
                    Thumbnail URL (Optional)
                    
                      
                    
                    
                  
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
              
              
                {isEdit ? "Update" : "Create"} News
              
            
          
        
      
    
  );
}