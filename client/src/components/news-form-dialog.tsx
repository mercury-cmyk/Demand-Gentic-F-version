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

type NewsFormData = z.infer<typeof newsFormSchema>;

interface NewsFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  news?: News;
}

export function NewsFormDialog({ open, onOpenChange, news }: NewsFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!news;

  const form = useForm<NewsFormData>({
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit News" : "Create News"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the news article details below." : "Fill in the details to create a new news article."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="News title" data-testid="input-news-title" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Slug</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="news-slug" data-testid="input-news-slug" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="community"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Community</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-community">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="hr">HR</SelectItem>
                      <SelectItem value="finance">Finance</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                      <SelectItem value="it">IT</SelectItem>
                      <SelectItem value="cx_ux">CX/UX</SelectItem>
                      <SelectItem value="data_ai">Data/AI</SelectItem>
                      <SelectItem value="ops">Ops</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="overviewHtml"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Overview (Optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="News overview..." rows={3} data-testid="textarea-overview" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="bodyHtml"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Body (Optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="News body content..." rows={6} data-testid="textarea-body" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="authors"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Authors (Optional)</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="John Doe, Jane Smith" data-testid="input-authors" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="publishedIso"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Published Date (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} type="datetime-local" data-testid="input-published-date" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="thumbnailUrl"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Thumbnail URL (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="https://..." data-testid="input-thumbnail" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="published">Published</SelectItem>
                        <SelectItem value="archived">Archived</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                data-testid="button-submit"
              >
                {isEdit ? "Update" : "Create"} News
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
