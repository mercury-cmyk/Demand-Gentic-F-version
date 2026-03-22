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

type SequenceFormData = z.infer;
type StepFormData = z.infer;

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
  const [steps, setSteps] = useState([]);
  const [editingStep, setEditingStep] = useState(null);

  const { data: mailboxAccounts = [] } = useQuery({
    queryKey: ["/api/mailbox-accounts"],
  });

  const { data: sequence } = useQuery({
    queryKey: [`/api/email-sequences/${sequenceId}`],
    enabled: !!sequenceId,
  });

  const { data: existingSteps = [] } = useQuery({
    queryKey: [`/api/email-sequences/${sequenceId}/steps`],
    enabled: !!sequenceId,
  });

  const form = useForm({
    resolver: zodResolver(sequenceSchema),
    defaultValues: {
      name: "",
      description: "",
      mailboxAccountId: "",
      status: "draft",
    },
  });

  const stepForm = useForm({
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
      return res.json() as Promise;
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
    
      
        
          
            {sequenceId ? "Edit Email Sequence" : "Create Email Sequence"}
          
          
            Set up an automated email sequence to nurture leads and close deals
          
        

        
          
            
               (
                  
                    Sequence Name
                    
                      
                    
                    
                  
                )}
              />

               (
                  
                    Send From Mailbox
                    
                      
                        
                          
                        
                      
                      
                        {mailboxAccounts.map((account) => (
                          
                            {account.emailAddress}
                          
                        ))}
                      
                    
                    
                  
                )}
              />
            

             (
                
                  Description
                  
                    
                  
                  
                
              )}
            />

             (
                
                  Status
                  
                    
                      
                        
                      
                    
                    
                      Draft
                      Active
                      Paused
                    
                  
                  
                
              )}
            />

            {/* Steps Section */}
            
              
                Email Steps
                {steps.length} steps
              

              {steps.length > 0 && (
                
                  {steps.map((step, index) => (
                    
                      
                        
                          
                            
                            Step {step.stepNumber}: {step.name || step.subject}
                          
                          
                             handleEditStep(index)}
                              data-testid={`button-edit-step-${index}`}
                            >
                              Edit
                            
                             handleDeleteStep(index)}
                              data-testid={`button-delete-step-${index}`}
                            >
                              
                            
                          
                        
                      
                      
                        
                          
                          Delay: {step.delayDays} days, {step.delayHours} hours
                        
                        
                          Subject: {step.subject}
                        
                      
                    
                  ))}
                
              )}

              {/* Add/Edit Step Form */}
              
                
                  
                    {editingStep !== null ? "Edit Step" : "Add New Step"}
                  
                
                
                  
                     (
                        
                          Step Name (Optional)
                          
                            
                          
                          
                        
                      )}
                    />

                    
                       (
                          
                            Delay (Days)
                            
                               field.onChange(parseInt(e.target.value) || 0)}
                                data-testid="input-delay-days"
                              />
                            
                            
                          
                        )}
                      />

                       (
                          
                            Delay (Hours)
                            
                               field.onChange(parseInt(e.target.value) || 0)}
                                data-testid="input-delay-hours"
                              />
                            
                            
                          
                        )}
                      />
                    
                  

                   (
                      
                        Email Subject
                        
                          
                        
                        
                          Tokens: {"{{firstName}}, {{lastName}}, {{companyName}}, {{jobTitle}}"}
                        
                        
                      
                    )}
                  />

                   (
                      
                        Email Body
                        
                          
                        
                        
                          Use personalization tokens to customize content for each contact
                        
                        
                      
                    )}
                  />

                  
                    
                    {editingStep !== null ? "Update Step" : "Add Step"}
                  
                
              
            

            
               onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              
              
                {createMutation.isPending || updateMutation.isPending
                  ? "Saving..."
                  : sequenceId
                  ? "Update Sequence"
                  : "Create Sequence"}
              
            
          
        
      
    
  );
}