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

type SenderProfileFormData = z.infer;

interface SenderProfileFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile?: SenderProfile;
}

export function SenderProfileFormDialog({ open, onOpenChange, profile }: SenderProfileFormDialogProps) {
  const { toast } = useToast();
  const isEdit = !!profile;

  const form = useForm({
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
    
      
        
          {isEdit ? "Edit Sender Profile" : "Create Sender Profile"}
          
            {isEdit ? "Update the sender profile details below." : "Fill in the details to create a new sender profile."}
          
        
        
          
             (
                
                  Profile Name
                  
                    
                  
                  
                    Internal name to identify this sender profile
                  
                  
                
              )}
            />

            
               (
                  
                    From Name
                    
                      
                    
                    
                  
                )}
              />

               (
                  
                    From Email
                    
                      
                    
                    
                  
                )}
              />
            

             (
                
                  Reply-To Email (Optional)
                  
                    
                  
                  
                    If different from the From Email
                  
                  
                
              )}
            />

             (
                
                  ESP Provider (Optional)
                  
                    
                      
                        
                      
                    
                    
                      SendGrid
                      Amazon SES
                      Mailgun
                    
                  
                  
                
              )}
            />

             (
                
                  Warmup Status (Optional)
                  
                    
                      
                        
                      
                    
                    
                      Not Started
                      In Progress
                      Completed
                      Paused
                    
                  
                  
                
              )}
            />

             (
                
                  Email Signature (HTML)
                  
                    Best regards,Pivotal Team123 Business Rd, City, Country" 
                      className="font-mono text-xs"
                      rows={4}
                      {...field} 
                    />
                  
                  
                    Include your physical mailing address for CAN-SPAM compliance.
                  
                  
                
              )}
            />

            
               (
                  
                    
                      Default Profile
                      
                        Use this profile by default
                      
                    
                    
                      
                    
                  
                )}
              />

               (
                  
                    
                      Active
                      
                        Enable this sender profile
                      
                    
                    
                      
                    
                  
                )}
              />
            

            
               onOpenChange(false)}
                data-testid="button-cancel"
              >
                Cancel
              
              
                {createMutation.isPending || updateMutation.isPending ? "Saving..." : isEdit ? "Update" : "Create"}
              
            
          
        
      
    
  );
}