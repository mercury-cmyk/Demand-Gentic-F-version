import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

// Available form fields
const AVAILABLE_FIELDS = [
  { id: 'leadName', label: 'Lead Name', description: 'Full name of the lead' },
  { id: 'email', label: 'Email', description: 'Email address (always required)' },
  { id: 'jobTitle', label: 'Job Title', description: 'Contact job title' },
  { id: 'companyName', label: 'Company Name', description: 'Company/Account name' },
  { id: 'phone', label: 'Phone Number', description: 'Contact phone number' },
  { id: 'industry', label: 'Industry', description: 'Company industry' },
  { id: 'companySize', label: 'Company Size', description: 'Number of employees' },
  { id: 'country', label: 'Country', description: 'Company country' },
  { id: 'message', label: 'Message', description: 'Custom message/notes' },
];

const formSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  pipelineId: z.string().min(1, "Pipeline is required"),
  defaultStage: z.string().min(1, "Default stage is required"),
  requiredFields: z.array(z.string()).min(1, "At least one field is required"),
  thankYouMessage: z.string().optional(),
  redirectUrl: z.string().url().optional().or(z.literal("")),
  assetUrl: z.string().url().optional().or(z.literal("")),
  active: z.boolean().default(true),
});

type FormData = z.infer<typeof formSchema>;

interface LeadForm {
  id: string;
  name: string;
  description?: string;
  pipelineId: string;
  defaultStage: string;
  requiredFields: string[];
  thankYouMessage?: string;
  redirectUrl?: string;
  assetUrl?: string;
  active: boolean;
}

interface Pipeline {
  id: string;
  name: string;
  stageOrder: string[];
}

interface LeadFormBuilderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form?: LeadForm;
}

export function LeadFormBuilderDialog({
  open,
  onOpenChange,
  form: existingForm,
}: LeadFormBuilderDialogProps) {
  const { toast } = useToast();

  // Fetch pipelines
  const { data: pipelines = [] } = useQuery<Pipeline[]>({
    queryKey: ["/api/pipelines"],
    enabled: open,
  });

  const formHandler = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      pipelineId: "",
      defaultStage: "",
      requiredFields: ["email", "leadName"],
      thankYouMessage: "Thank you for your interest! We'll be in touch soon.",
      redirectUrl: "",
      assetUrl: "",
      active: true,
    },
  });

  // Reset form when dialog opens with existing form data
  useEffect(() => {
    if (open && existingForm) {
      formHandler.reset({
        name: existingForm.name,
        description: existingForm.description || "",
        pipelineId: existingForm.pipelineId,
        defaultStage: existingForm.defaultStage,
        requiredFields: existingForm.requiredFields,
        thankYouMessage: existingForm.thankYouMessage || "",
        redirectUrl: existingForm.redirectUrl || "",
        assetUrl: existingForm.assetUrl || "",
        active: existingForm.active,
      });
    } else if (open && !existingForm) {
      formHandler.reset({
        name: "",
        description: "",
        pipelineId: "",
        defaultStage: "",
        requiredFields: ["email", "leadName"],
        thankYouMessage: "Thank you for your interest! We'll be in touch soon.",
        redirectUrl: "",
        assetUrl: "",
        active: true,
      });
    }
  }, [open, existingForm, formHandler]);

  // Get stages for selected pipeline
  const selectedPipeline = pipelines.find(
    (p) => p.id === formHandler.watch("pipelineId")
  );
  const availableStages = selectedPipeline?.stageOrder || [];

  // Create/Update mutation
  const mutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (existingForm) {
        return await apiRequest("PUT", `/api/lead-forms/${existingForm.id}`, data);
      } else {
        return await apiRequest("POST", "/api/lead-forms", data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/lead-forms"] });
      toast({
        title: existingForm ? "Form updated" : "Form created",
        description: existingForm
          ? "Lead form has been updated successfully"
          : "Lead form has been created successfully",
      });
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save lead form",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: FormData) => {
    mutation.mutate(data);
  };

  const handleFieldToggle = (fieldId: string, checked: boolean) => {
    const currentFields = formHandler.getValues("requiredFields");
    
    // Email is always required
    if (fieldId === "email") {
      return;
    }

    if (checked) {
      formHandler.setValue("requiredFields", [...currentFields, fieldId]);
    } else {
      formHandler.setValue(
        "requiredFields",
        currentFields.filter((f) => f !== fieldId)
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existingForm ? "Edit Lead Form" : "Create Lead Form"}
          </DialogTitle>
          <DialogDescription>
            Configure your lead capture form and map it to a pipeline stage
          </DialogDescription>
        </DialogHeader>

        <Form {...formHandler}>
          <form onSubmit={formHandler.handleSubmit(onSubmit)} className="space-y-6">
            {/* Form Name */}
            <FormField
              control={formHandler.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Form Name</FormLabel>
                  <FormControl>
                    <Input 
                      placeholder="e.g., Partnership Inquiry Form" 
                      {...field}
                      data-testid="input-form-name"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={formHandler.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Internal description of this form's purpose"
                      {...field}
                      data-testid="input-description"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Pipeline Selection */}
            <FormField
              control={formHandler.control}
              name="pipelineId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Pipeline</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-pipeline">
                        <SelectValue placeholder="Select a pipeline" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {pipelines.map((pipeline) => (
                        <SelectItem key={pipeline.id} value={pipeline.id}>
                          {pipeline.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    New leads will be added to this pipeline
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Default Stage */}
            <FormField
              control={formHandler.control}
              name="defaultStage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Default Stage</FormLabel>
                  <Select 
                    onValueChange={field.onChange} 
                    value={field.value}
                    disabled={!selectedPipeline}
                  >
                    <FormControl>
                      <SelectTrigger data-testid="select-stage">
                        <SelectValue placeholder="Select a stage" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {availableStages.map((stage) => (
                        <SelectItem key={stage} value={stage}>
                          {stage}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Leads will start in this stage
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Required Fields */}
            <FormField
              control={formHandler.control}
              name="requiredFields"
              render={() => (
                <FormItem>
                  <FormLabel>Required Fields</FormLabel>
                  <FormDescription className="mb-3">
                    Select which fields should be required on the form
                  </FormDescription>
                  <div className="space-y-2">
                    {AVAILABLE_FIELDS.map((field) => {
                      const isChecked = formHandler
                        .watch("requiredFields")
                        .includes(field.id);
                      const isEmail = field.id === "email";
                      
                      return (
                        <div key={field.id} className="flex items-start space-x-3">
                          <Checkbox
                            id={field.id}
                            checked={isChecked}
                            onCheckedChange={(checked) =>
                              handleFieldToggle(field.id, checked as boolean)
                            }
                            disabled={isEmail}
                            data-testid={`checkbox-field-${field.id}`}
                          />
                          <div className="grid gap-1.5 leading-none">
                            <label
                              htmlFor={field.id}
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                            >
                              {field.label}
                              {isEmail && (
                                <span className="text-muted-foreground ml-2 text-xs">
                                  (always required)
                                </span>
                              )}
                            </label>
                            <p className="text-xs text-muted-foreground">
                              {field.description}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Thank You Message */}
            <FormField
              control={formHandler.control}
              name="thankYouMessage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Thank You Message (Optional)</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Message to show after successful submission"
                      {...field}
                      data-testid="input-thank-you-message"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Redirect URL */}
            <FormField
              control={formHandler.control}
              name="redirectUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Redirect URL (Optional)</FormLabel>
                  <FormControl>
                    <Input 
                      type="url"
                      placeholder="https://example.com/thank-you"
                      {...field}
                      data-testid="input-redirect-url"
                    />
                  </FormControl>
                  <FormDescription>
                    Redirect users to this URL after submission
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Asset URL */}
            <FormField
              control={formHandler.control}
              name="assetUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Asset/Download URL (Optional)</FormLabel>
                  <FormControl>
                    <Input 
                      type="url"
                      placeholder="https://example.com/whitepaper.pdf"
                      {...field}
                      data-testid="input-asset-url"
                    />
                  </FormControl>
                  <FormDescription>
                    Provide a downloadable asset link after submission
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Active Status */}
            <FormField
              control={formHandler.control}
              name="active"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Active</FormLabel>
                    <FormDescription>
                      Allow submissions to this form
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      data-testid="switch-active"
                    />
                  </FormControl>
                </FormItem>
              )}
            />

            {/* Submit Buttons */}
            <div className="flex justify-end gap-3">
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
                disabled={mutation.isPending}
                data-testid="button-save-form"
              >
                {mutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {existingForm ? "Update Form" : "Create Form"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
