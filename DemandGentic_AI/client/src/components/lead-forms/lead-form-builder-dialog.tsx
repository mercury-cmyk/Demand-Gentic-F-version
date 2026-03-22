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

type FormData = z.infer;

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
  const { data: pipelines = [] } = useQuery({
    queryKey: ["/api/pipelines"],
    enabled: open,
  });

  const formHandler = useForm({
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
    
      
        
          
            {existingForm ? "Edit Lead Form" : "Create Lead Form"}
          
          
            Configure your lead capture form and map it to a pipeline stage
          
        

        
          
            {/* Form Name */}
             (
                
                  Form Name
                  
                    
                  
                  
                
              )}
            />

            {/* Description */}
             (
                
                  Description (Optional)
                  
                    
                  
                  
                
              )}
            />

            {/* Pipeline Selection */}
             (
                
                  Pipeline
                  
                    
                      
                        
                      
                    
                    
                      {pipelines.map((pipeline) => (
                        
                          {pipeline.name}
                        
                      ))}
                    
                  
                  
                    New leads will be added to this pipeline
                  
                  
                
              )}
            />

            {/* Default Stage */}
             (
                
                  Default Stage
                  
                    
                      
                        
                      
                    
                    
                      {availableStages.map((stage) => (
                        
                          {stage}
                        
                      ))}
                    
                  
                  
                    Leads will start in this stage
                  
                  
                
              )}
            />

            {/* Required Fields */}
             (
                
                  Required Fields
                  
                    Select which fields should be required on the form
                  
                  
                    {AVAILABLE_FIELDS.map((field) => {
                      const isChecked = formHandler
                        .watch("requiredFields")
                        .includes(field.id);
                      const isEmail = field.id === "email";
                      
                      return (
                        
                          
                              handleFieldToggle(field.id, checked as boolean)
                            }
                            disabled={isEmail}
                            data-testid={`checkbox-field-${field.id}`}
                          />
                          
                            
                              {field.label}
                              {isEmail && (
                                
                                  (always required)
                                
                              )}
                            
                            
                              {field.description}
                            
                          
                        
                      );
                    })}
                  
                  
                
              )}
            />

            {/* Thank You Message */}
             (
                
                  Thank You Message (Optional)
                  
                    
                  
                  
                
              )}
            />

            {/* Redirect URL */}
             (
                
                  Redirect URL (Optional)
                  
                    
                  
                  
                    Redirect users to this URL after submission
                  
                  
                
              )}
            />

            {/* Asset URL */}
             (
                
                  Asset/Download URL (Optional)
                  
                    
                  
                  
                    Provide a downloadable asset link after submission
                  
                  
                
              )}
            />

            {/* Active Status */}
             (
                
                  
                    Active
                    
                      Allow submissions to this form
                    
                  
                  
                    
                  
                
              )}
            />

            {/* Submit Buttons */}
            
               onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              
              
                {mutation.isPending && (
                  
                )}
                {existingForm ? "Update Form" : "Create Form"}
              
            
          
        
      
    
  );
}