import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Clock, Mail } from "lucide-react";

const sequenceSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  mailboxAccountId: z.string().min(1, "Mailbox is required"),
  status: z.enum(["active", "paused", "draft"]).default("draft"),
});

const stepSchema = z.object({
  stepNumber: z.number().min(1),
  name: z.string().optional(),
  delayDays: z.number().min(0).default(0),
  delayHours: z.number().min(0).max(23).default(0),
  subject: z.string().min(1, "Subject is required"),
  htmlBody: z.string().min(1, "Email body is required"),
  textBody: z.string().optional(),
  status: z.enum(["active", "paused"]).default("active"),
});

type SequenceFormData = z.infer<typeof sequenceSchema>;
type StepFormData = z.infer<typeof stepSchema>;

interface EmailSequenceFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sequenceId?: string;
}

interface MailboxAccount {
  id: string;
  emailAddress: string;
  isActive: boolean;
}

interface EmailSequence {
  id: string;
  name: string;
  description?: string;
  mailboxAccountId: string;
  status: string;
}

interface SequenceStep {
  id: string;
  stepNumber: number;
  name?: string;
  delayDays: number;
  delayHours: number;
  subject: string;
  htmlBody: string;
  textBody?: string;
  status: string;
}

export function EmailSequenceFormDialog({
  open,
  onOpenChange,
  sequenceId,
}: EmailSequenceFormDialogProps) {
  const { toast } = useToast();
  const [steps, setSteps] = useState<StepFormData[]>([]);
  const [editingStep, setEditingStep] = useState<number | null>(null);

  const { data: mailboxAccounts = [] } = useQuery<MailboxAccount[]>({
    queryKey: ["/api/mailbox-accounts"],
  });

  const { data: sequence } = useQuery<EmailSequence>({
    queryKey: [`/api/email-sequences/${sequenceId}`],
    enabled: !!sequenceId,
  });

  const { data: existingSteps = [] } = useQuery<SequenceStep[]>({
    queryKey: [`/api/email-sequences/${sequenceId}/steps`],
    enabled: !!sequenceId,
  });

  const form = useForm<SequenceFormData>({
    resolver: zodResolver(sequenceSchema),
    defaultValues: {
      name: "",
      description: "",
      mailboxAccountId: "",
      status: "draft",
    },
  });

  const stepForm = useForm<StepFormData>({
    resolver: zodResolver(stepSchema),
    defaultValues: {
      stepNumber: 1,
      name: "",
      delayDays: 0,
      delayHours: 0,
      subject: "",
      htmlBody: "",
      textBody: "",
      status: "active",
    },
  });

  // Hydrate form and steps when editing
  useEffect(() => {
    if (sequence) {
      form.reset({
        name: sequence.name,
        description: sequence.description || "",
        mailboxAccountId: sequence.mailboxAccountId,
        status: sequence.status as "active" | "paused" | "draft",
      });
    }
  }, [sequence]);

  useEffect(() => {
    if (sequenceId && existingSteps.length > 0) {
      const mappedSteps = existingSteps.map((step) => ({
        stepNumber: step.stepNumber,
        name: step.name,
        delayDays: step.delayDays,
        delayHours: step.delayHours,
        subject: step.subject,
        htmlBody: step.htmlBody,
        textBody: step.textBody,
        status: step.status as "active" | "paused",
      }));
      setSteps(mappedSteps);
    } else if (!sequenceId) {
      // Reset steps when creating new sequence
      setSteps([]);
    }
  }, [sequenceId, existingSteps]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      form.reset();
      setSteps([]);
      setEditingStep(null);
      stepForm.reset();
    }
  }, [open]);

  const createMutation = useMutation({
    mutationFn: async (data: SequenceFormData) => {
      const res = await apiRequest("POST", "/api/email-sequences", data);
      return res.json() as Promise<EmailSequence>;
    },
    onSuccess: async (result: EmailSequence) => {
      // Create all steps
      for (const step of steps) {
        await apiRequest("POST", `/api/email-sequences/${result.id}/steps`, step);
      }
      
      await queryClient.invalidateQueries({ queryKey: ["/api/email-sequences"] });
      toast({
        title: "Success",
        description: "Email sequence created successfully",
      });
      onOpenChange(false);
      form.reset();
      setSteps([]);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create sequence",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: SequenceFormData) => {
      if (!sequenceId) throw new Error("No sequence ID");
      
      // Update sequence metadata
      await apiRequest("PATCH", `/api/email-sequences/${sequenceId}`, data);
      
      // Delete all existing steps
      for (const existingStep of existingSteps) {
        await apiRequest("DELETE", `/api/sequence-steps/${existingStep.id}`, {});
      }
      
      // Create new steps
      for (const step of steps) {
        await apiRequest("POST", `/api/email-sequences/${sequenceId}/steps`, step);
      }
      
      return { id: sequenceId };
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/email-sequences"] });
      toast({
        title: "Success",
        description: "Email sequence updated successfully",
      });
      onOpenChange(false);
      form.reset();
      setSteps([]);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update sequence",
        variant: "destructive",
      });
    },
  });

  const handleAddStep = (data: StepFormData) => {
    if (editingStep !== null) {
      const updatedSteps = [...steps];
      updatedSteps[editingStep] = data;
      setSteps(updatedSteps);
      setEditingStep(null);
    } else {
      setSteps([...steps, { ...data, stepNumber: steps.length + 1 }]);
    }
    stepForm.reset();
  };

  const handleEditStep = (index: number) => {
    const step = steps[index];
    stepForm.reset(step);
    setEditingStep(index);
  };

  const handleDeleteStep = (index: number) => {
    const updatedSteps = steps.filter((_, i) => i !== index);
    // Renumber steps
    const renumbered = updatedSteps.map((s, i) => ({ ...s, stepNumber: i + 1 }));
    setSteps(renumbered);
  };

  const onSubmit = (data: SequenceFormData) => {
    if (steps.length === 0 && !sequenceId) {
      toast({
        title: "Error",
        description: "Please add at least one step to the sequence",
        variant: "destructive",
      });
      return;
    }

    if (sequenceId) {
      updateMutation.mutate(data);
    } else {
      createMutation.mutate(data);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {sequenceId ? "Edit Email Sequence" : "Create Email Sequence"}
          </DialogTitle>
          <DialogDescription>
            Set up an automated email sequence to nurture leads and close deals
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sequence Name</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="e.g., New Lead Nurture"
                        data-testid="input-sequence-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="mailboxAccountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Send From Mailbox</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-mailbox">
                          <SelectValue placeholder="Select mailbox" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {mailboxAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.emailAddress}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      {...field}
                      placeholder="Describe the purpose of this sequence..."
                      data-testid="input-sequence-description"
                    />
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
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-sequence-status">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="paused">Paused</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Steps Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Email Steps</h3>
                <Badge variant="secondary">{steps.length} steps</Badge>
              </div>

              {steps.length > 0 && (
                <div className="space-y-3">
                  {steps.map((step, index) => (
                    <Card key={index}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            Step {step.stepNumber}: {step.name || step.subject}
                          </CardTitle>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditStep(index)}
                              data-testid={`button-edit-step-${index}`}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteStep(index)}
                              data-testid={`button-delete-step-${index}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-4 w-4" />
                          Delay: {step.delayDays} days, {step.delayHours} hours
                        </div>
                        <div className="mt-2 text-muted-foreground">
                          Subject: {step.subject}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {/* Add/Edit Step Form */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    {editingStep !== null ? "Edit Step" : "Add New Step"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={stepForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Step Name (Optional)</FormLabel>
                          <FormControl>
                            <Input
                              {...field}
                              placeholder="e.g., Initial Outreach"
                              data-testid="input-step-name"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <FormField
                        control={stepForm.control}
                        name="delayDays"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Delay (Days)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                data-testid="input-delay-days"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={stepForm.control}
                        name="delayHours"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Delay (Hours)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                {...field}
                                onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                data-testid="input-delay-hours"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>

                  <FormField
                    control={stepForm.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Subject</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Use {{firstName}}, {{lastName}}, {{companyName}} for personalization"
                            data-testid="input-step-subject"
                          />
                        </FormControl>
                        <FormDescription>
                          Tokens: {"{{firstName}}, {{lastName}}, {{companyName}}, {{jobTitle}}"}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={stepForm.control}
                    name="htmlBody"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email Body</FormLabel>
                        <FormControl>
                          <Textarea
                            {...field}
                            rows={8}
                            placeholder="Hi {{firstName}},&#10;&#10;I noticed that {{companyName}}...&#10;&#10;Best regards"
                            data-testid="input-step-body"
                          />
                        </FormControl>
                        <FormDescription>
                          Use personalization tokens to customize content for each contact
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="button"
                    variant="outline"
                    onClick={stepForm.handleSubmit(handleAddStep)}
                    className="w-full"
                    data-testid="button-add-step"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {editingStep !== null ? "Update Step" : "Add Step"}
                  </Button>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t">
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
                data-testid="button-save-sequence"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : sequenceId
                  ? "Update Sequence"
                  : "Create Sequence"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
