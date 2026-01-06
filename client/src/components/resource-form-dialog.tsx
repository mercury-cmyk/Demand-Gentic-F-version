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

type ResourceFormData = z.infer<typeof resourceFormSchema>;

interface ResourceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource?: Resource;
}

export function ResourceFormDialog({ open, onOpenChange, resource }: ResourceFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!resource;

  const form = useForm<ResourceFormData>({
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Resource" : "Create Resource"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the resource details below." : "Fill in the details to create a new resource."}
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
                      <Input {...field} placeholder="Resource title" data-testid="input-resource-title" />
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
                      <Input {...field} placeholder="resource-slug" data-testid="input-resource-slug" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="resourceType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Resource Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-resource-type">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ebook">eBook</SelectItem>
                        <SelectItem value="infographic">Infographic</SelectItem>
                        <SelectItem value="white_paper">White Paper</SelectItem>
                        <SelectItem value="guide">Guide</SelectItem>
                        <SelectItem value="case_study">Case Study</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
            </div>

            <FormField
              control={form.control}
              name="overviewHtml"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Overview (Optional)</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Resource overview..." rows={3} data-testid="textarea-overview" />
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
                    <Textarea {...field} placeholder="Resource body content..." rows={6} data-testid="textarea-body" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
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
                name="ctaLink"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CTA Link (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="https://..." data-testid="input-cta-link" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="formId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Form ID (Optional)</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="form-id" data-testid="input-form-id" />
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
                {isEdit ? "Update" : "Create"} Resource
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
