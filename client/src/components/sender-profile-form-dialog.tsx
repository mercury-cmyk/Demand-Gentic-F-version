import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { SenderProfile } from "@shared/schema";

const senderProfileFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  fromName: z.string().min(1, "From name is required"),
  fromEmail: z.string().email("Invalid email address"),
  replyToEmail: z.string().email("Invalid email address").optional().or(z.literal("")),
  espProvider: z.enum(["sendgrid", "ses", "mailgun"]).optional().or(z.literal("")),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  warmupStatus: z.enum(["not_started", "in_progress", "completed", "paused"]).optional().or(z.literal("")),
  signatureHtml: z.string().optional(),
});

type SenderProfileFormData = z.infer<typeof senderProfileFormSchema>;

interface SenderProfileFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile?: SenderProfile;
}

export function SenderProfileFormDialog({ open, onOpenChange, profile }: SenderProfileFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!profile;

  const form = useForm<SenderProfileFormData>({
    resolver: zodResolver(senderProfileFormSchema),
    defaultValues: {
      name: profile?.name || "",
      fromName: profile?.fromName || "",
      fromEmail: profile?.fromEmail || "",
      replyToEmail: profile?.replyToEmail || "",
      espProvider: (profile?.espProvider as "sendgrid" | "ses" | "mailgun") || "",
      isDefault: profile?.isDefault || false,
      isActive: profile?.isActive !== false,
      warmupStatus: (profile?.warmupStatus as "not_started" | "in_progress" | "completed" | "paused") || "",
      signatureHtml: profile?.signatureHtml || "",
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: SenderProfileFormData) => {
      return await apiRequest("POST", "/api/sender-profiles", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sender-profiles"] });
      toast({
        title: "Sender Profile created",
        description: "The sender profile has been successfully created.",
      });
      onOpenChange(false);
      form.reset();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create sender profile.",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: SenderProfileFormData) => {
      return await apiRequest("PUT", `/api/sender-profiles/${profile?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sender-profiles"] });
      toast({
        title: "Sender Profile updated",
        description: "The sender profile has been successfully updated.",
      });
      onOpenChange(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update sender profile.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: SenderProfileFormData) => {
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
          <DialogTitle>{isEdit ? "Edit Sender Profile" : "Create Sender Profile"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update the sender profile details below." : "Fill in the details to create a new sender profile."}
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Profile Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., Pivotal - Marketing" {...field} data-testid="input-name" />
                  </FormControl>
                  <FormDescription>
                    Internal name to identify this sender profile
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="fromName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>From Name</FormLabel>
                    <FormControl>
                      <Input placeholder="PipelineIQ" {...field} data-testid="input-from-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="fromEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>From Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="noreply@example.com" {...field} data-testid="input-from-email" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="replyToEmail"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reply-To Email (Optional)</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="support@example.com" {...field} data-testid="input-reply-to-email" />
                  </FormControl>
                  <FormDescription>
                    If different from the From Email
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="espProvider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ESP Provider (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <FormControl>
                      <SelectTrigger data-testid="select-esp-provider">
                        <SelectValue placeholder="Select an ESP provider" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="sendgrid">SendGrid</SelectItem>
                      <SelectItem value="ses">Amazon SES</SelectItem>
                      <SelectItem value="mailgun">Mailgun</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="warmupStatus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Warmup Status (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || undefined}>
                    <FormControl>
                      <SelectTrigger data-testid="select-warmup-status">
                        <SelectValue placeholder="Select warmup status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="not_started">Not Started</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="signatureHtml"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email Signature (HTML)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="<p>Best regards,<br>Pivotal Team<br>123 Business Rd, City, Country</p>" 
                      className="font-mono text-xs"
                      rows={4}
                      {...field} 
                    />
                  </FormControl>
                  <FormDescription>
                    Include your physical mailing address for CAN-SPAM compliance.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="isDefault"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Default Profile</FormLabel>
                      <FormDescription>
                        Use this profile by default
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-is-default"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-md border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Active</FormLabel>
                      <FormDescription>
                        Enable this sender profile
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="switch-is-active"
                      />
                    </FormControl>
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
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : isEdit ? "Update" : "Create"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
