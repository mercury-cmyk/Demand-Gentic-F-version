import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Newspaper, Trash2, Edit, Users } from "lucide-react";
import { format } from "date-fns";
import type { News } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { NewsFormDialog } from "@/components/news-form-dialog";

export default function NewsPage() {
  const { toast } = useToast();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editNews, setEditNews] = useState(undefined);

  const { data: news = [], isLoading } = useQuery({
    queryKey: ["/api/news"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest(`/api/news/${id}`, "DELETE");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/news"] });
      toast({
        title: "News deleted",
        description: "The news article has been successfully deleted.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete news article.",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      
        
          
          News
        
        Loading news...
      
    );
  }

  return (
    
      
        
          
          News
        
         setCreateDialogOpen(true)} data-testid="button-create-news">
          
          Create News
        
      

      {news.length === 0 ? (
        
          
            
              
              No news yet
              
                Create your first news article to get started
              
               setCreateDialogOpen(true)} data-testid="button-create-first-news">
                
                Create News
              
            
          
        
      ) : (
        
          {news.map((newsItem) => (
            
              
                
                  
                    
                      {newsItem.title}
                      {newsItem.status && (
                        
                          {newsItem.status}
                        
                      )}
                    
                    {newsItem.overviewHtml && (
                      {newsItem.overviewHtml.substring(0, 150)}...
                    )}
                    {newsItem.publishedIso && (
                      
                        {format(new Date(newsItem.publishedIso), "PPP")}
                      
                    )}
                  
                  
                     setEditNews(newsItem)}
                      data-testid={`button-edit-${newsItem.id}`}
                    >
                      
                    
                     deleteMutation.mutate(newsItem.id)}
                      data-testid={`button-delete-${newsItem.id}`}
                    >
                      
                    
                  
                
              
              
                
                  
                    
                    
                      {newsItem.community}
                    
                  
                  {newsItem.authors && newsItem.authors.length > 0 && (
                    
                      By: {newsItem.authors.join(", ")}
                    
                  )}
                
              
            
          ))}
        
      )}

      
      
       !open && setEditNews(undefined)}
        news={editNews}
      />
    
  );
}