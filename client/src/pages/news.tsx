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
  const [editNews, setEditNews] = useState<News | undefined>(undefined);

  const { data: news = [], isLoading } = useQuery<News[]>({
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
      <div className="p-6">
        <div className="flex items-center gap-2 mb-6">
          <Newspaper className="h-6 w-6" />
          <h1 className="text-2xl font-bold">News</h1>
        </div>
        <div className="text-muted-foreground">Loading news...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Newspaper className="h-6 w-6" />
          <h1 className="text-2xl font-bold">News</h1>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-news">
          <Plus className="h-4 w-4 mr-2" />
          Create News
        </Button>
      </div>

      {news.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12">
              <Newspaper className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No news yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first news article to get started
              </p>
              <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-news">
                <Plus className="h-4 w-4 mr-2" />
                Create News
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {news.map((newsItem) => (
            <Card key={newsItem.id} data-testid={`card-news-${newsItem.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <CardTitle>{newsItem.title}</CardTitle>
                      {newsItem.status && (
                        <Badge 
                          variant={newsItem.status === 'published' ? 'default' : 'secondary'}
                          data-testid={`badge-status-${newsItem.id}`}
                        >
                          {newsItem.status}
                        </Badge>
                      )}
                    </div>
                    {newsItem.overviewHtml && (
                      <CardDescription>{newsItem.overviewHtml.substring(0, 150)}...</CardDescription>
                    )}
                    {newsItem.publishedIso && (
                      <div className="text-sm text-muted-foreground mt-2" data-testid={`text-date-${newsItem.id}`}>
                        {format(new Date(newsItem.publishedIso), "PPP")}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="icon" 
                      variant="ghost"
                      onClick={() => setEditNews(newsItem)}
                      data-testid={`button-edit-${newsItem.id}`}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => deleteMutation.mutate(newsItem.id)}
                      data-testid={`button-delete-${newsItem.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span data-testid={`text-community-${newsItem.id}`}>
                      {newsItem.community}
                    </span>
                  </div>
                  {newsItem.authors && newsItem.authors.length > 0 && (
                    <div className="text-muted-foreground" data-testid={`text-authors-${newsItem.id}`}>
                      By: {newsItem.authors.join(", ")}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewsFormDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
      />
      
      <NewsFormDialog
        open={!!editNews}
        onOpenChange={(open) => !open && setEditNews(undefined)}
        news={editNews}
      />
    </div>
  );
}
