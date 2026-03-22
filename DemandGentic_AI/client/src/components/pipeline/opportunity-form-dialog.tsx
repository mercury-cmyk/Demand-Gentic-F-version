import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

interface Account {
  id: string;
  name: string;
}

interface Contact {
  id: string;
  accountId: string;
  fullName: string;
  email: string;
}

const opportunitySchema = z.object({
  name: z.string().min(1, "Opportunity name is required"),
  pipelineId: z.string().min(1, "Pipeline is required"),
  accountId: z.string().optional(),
  contactId: z.string().optional(),
  stage: z.string().min(1, "Stage is required"),
  amount: z.string().min(0),
  probability: z.number().min(0).max(100),
  closeDate: z.string().optional(),
  reason: z.string().optional(),
  
  // Media & Data Partnership Fields
  partnerName: z.string().optional(),
  partnershipType: z.enum(["publisher", "data_provider", "syndication_network", "media_buyer"]).optional(),
  pricingModel: z.enum(["cpl", "cpc", "hybrid", "flat_fee"]).optional(),
  costPerLead: z.string().optional(),
  costPerContact: z.string().optional(),
  leadVolumeGoal: z.string().optional(),
  qualityTier: z.enum(["verified", "unverified", "data_append", "premium"]).optional(),
  partnerAccountManager: z.string().optional(),
  deliveryMethod: z.enum(["api", "csv", "realtime_push", "sftp", "email"]).optional(),
  
  // Direct Sales Fields
  contractType: z.enum(["retainer", "one_time", "subscription", "per_project"]).optional(),
  estimatedDealValue: z.string().optional(),
  intentScore: z.number().min(0).max(100).optional(),
  leadSource: z.string().optional(),
});

type OpportunityFormData = z.infer;

interface Opportunity {
  id: string;
  name: string;
  pipelineId: string;
  accountId: string | null;
  contactId?: string | null;
  ownerId?: string | null;
  stage: string;
  status: string;
  amount: string;
  currency: string;
  probability: number;
  closeDate: string | null;
  forecastCategory: string;
  flaggedForSla: boolean;
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OpportunityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pipelineId: string;
  opportunity?: Opportunity;
}

interface Pipeline {
  id: string;
  name: string;
  category: 'media_partnership' | 'direct_sales';
  stageOrder: string[];
}

export function OpportunityFormDialog({
  open,
  onOpenChange,
  pipelineId,
  opportunity,
}: OpportunityFormDialogProps) {
  const { toast } = useToast();
  const isEditing = !!opportunity;

  const { data: pipeline } = useQuery({
    queryKey: [`/api/pipelines/${pipelineId}`],
    enabled: !!pipelineId,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["/api/accounts"],
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["/api/contacts"],
  });

  const isMediaPartnership = pipeline?.category === 'media_partnership';
  const isDirectSales = pipeline?.category === 'direct_sales';

  const form = useForm({
    resolver: zodResolver(opportunitySchema),
    defaultValues: {
      name: opportunity?.name || "",
      pipelineId: opportunity?.pipelineId || pipelineId,
      accountId: opportunity?.accountId || "",
      contactId: opportunity?.contactId || "",
      stage: opportunity?.stage || "qualification",
      amount: opportunity?.amount || "0",
      probability: opportunity?.probability || 0,
      closeDate: opportunity?.closeDate
        ? new Date(opportunity.closeDate).toISOString().split("T")[0]
        : "",
      reason: opportunity?.reason || "",
      
      // Media & Data Partnership defaults
      partnerName: (opportunity as any)?.partnerName || "",
      partnershipType: (opportunity as any)?.partnershipType || undefined,
      pricingModel: (opportunity as any)?.pricingModel || undefined,
      costPerLead: (opportunity as any)?.costPerLead || "",
      costPerContact: (opportunity as any)?.costPerContact || "",
      leadVolumeGoal: (opportunity as any)?.leadVolumeGoal || "",
      qualityTier: (opportunity as any)?.qualityTier || undefined,
      partnerAccountManager: (opportunity as any)?.partnerAccountManager || "",
      deliveryMethod: (opportunity as any)?.deliveryMethod || undefined,
      
      // Direct Sales defaults
      contractType: (opportunity as any)?.contractType || undefined,
      estimatedDealValue: (opportunity as any)?.estimatedDealValue || "",
      intentScore: (opportunity as any)?.intentScore !== undefined ? (opportunity as any)?.intentScore : undefined,
      leadSource: (opportunity as any)?.leadSource || "",
    },
  });

  const selectedAccountId = form.watch("accountId");
  const filteredContacts = contacts.filter(
    (c) => c.accountId === selectedAccountId
  );

  const createMutation = useMutation({
    mutationFn: async (data: OpportunityFormData) => {
      // Build base payload with only shared fields (no category-specific fields)
      const basePayload: any = {
        name: data.name,
        pipelineId: data.pipelineId,
        accountId: data.accountId || null,
        contactId: data.contactId || null,
        stage: data.stage,
        amount: data.amount ? parseFloat(data.amount) : 0,
        probability: data.probability,
        closeDate: data.closeDate || null,
        reason: data.reason || null,
      };

      // Only include Media Partnership fields if pipeline category is media_partnership
      if (isMediaPartnership) {
        Object.assign(basePayload, {
          partnerName: data.partnerName || null,
          partnershipType: data.partnershipType || null,
          pricingModel: data.pricingModel || null,
          costPerLead: data.costPerLead ? parseFloat(data.costPerLead) : null,
          costPerContact: data.costPerContact ? parseFloat(data.costPerContact) : null,
          leadVolumeGoal: data.leadVolumeGoal ? parseInt(data.leadVolumeGoal) : null,
          qualityTier: data.qualityTier || null,
          partnerAccountManager: data.partnerAccountManager || null,
          deliveryMethod: data.deliveryMethod || null,
        });
      }

      // Only include Direct Sales fields if pipeline category is direct_sales
      if (isDirectSales) {
        Object.assign(basePayload, {
          contractType: data.contractType || null,
          estimatedDealValue: data.estimatedDealValue ? parseFloat(data.estimatedDealValue) : null,
          intentScore: data.intentScore !== undefined ? data.intentScore : null,
          leadSource: data.leadSource || null,
        });
      }

      if (isEditing) {
        return await apiRequest(
          "PUT",
          `/api/opportunities/${opportunity.id}`,
          basePayload
        );
      }
      return await apiRequest("POST", "/api/opportunities", basePayload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/opportunities"] });
      queryClient.invalidateQueries({
        queryKey: [`/api/pipelines/${pipelineId}/opportunities`],
      });
      toast({
        title: "Success",
        description: `Opportunity ${isEditing ? "updated" : "created"} successfully`,
      });
      onOpenChange(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: OpportunityFormData) => {
    createMutation.mutate(data);
  };

  return (
    
      
        
          
            {isEditing ? "Edit Opportunity" : "Create Opportunity"}
          
          
            Add a new deal to your pipeline
          
        

        
          
             (
                
                  Opportunity Name
                  
                    
                  
                  
                
              )}
            />

             (
                
                  Account
                  
                    
                      
                        
                      
                    
                    
                      {accounts.map((account) => (
                        
                          {account.name}
                        
                      ))}
                    
                  
                  
                
              )}
            />

             (
                
                  Primary Contact (Optional)
                  
                    
                      
                        
                      
                    
                    
                      {filteredContacts.map((contact) => (
                        
                          {contact.fullName} - {contact.email}
                        
                      ))}
                    
                  
                  
                    Contacts filtered by selected account
                  
                  
                
              )}
            />

            
               (
                  
                    Amount
                    
                      
                    
                    
                  
                )}
              />

               (
                  
                    Probability (%)
                    
                      
                          field.onChange(parseInt(e.target.value) || 0)
                        }
                      />
                    
                    
                  
                )}
              />
            

            
               (
                  
                    Stage
                    
                      
                        
                          
                        
                      
                      
                        
                          Qualification
                        
                        Proposal
                        Negotiation
                        Closed Won
                        Closed Lost
                      
                    
                    
                  
                )}
              />

               (
                  
                    Expected Close Date
                    
                      
                    
                    
                  
                )}
              />
            

             (
                
                  Reason / Notes (Optional)
                  
                    
                  
                  
                
              )}
            />

            {/* Media & Data Partnership Fields */}
            {isMediaPartnership && (
              <>
                
                  Partnership Details
                  
                  
                     (
                        
                          Partner Name
                          
                            
                          
                          
                        
                      )}
                    />

                    
                       (
                          
                            Partnership Type
                            
                              
                                
                                  
                                
                              
                              
                                Publisher
                                Data Provider
                                Syndication Network
                                Media Buyer
                              
                            
                            
                          
                        )}
                      />

                       (
                          
                            Pricing Model
                            
                              
                                
                                  
                                
                              
                              
                                CPL - Cost Per Lead
                                CPC - Cost Per Contact
                                Hybrid Model
                                Flat Fee
                              
                            
                            
                          
                        )}
                      />
                    

                    
                       (
                          
                            Cost Per Lead ($)
                            
                              
                            
                            
                          
                        )}
                      />

                       (
                          
                            Cost Per Contact ($)
                            
                              
                            
                            
                          
                        )}
                      />
                    

                    
                       (
                          
                            Lead Volume Goal
                            
                              
                            
                            Monthly lead target
                            
                          
                        )}
                      />

                       (
                          
                            Quality Tier
                            
                              
                                
                                  
                                
                              
                              
                                Verified
                                Unverified
                                Data Append
                                Premium
                              
                            
                            
                          
                        )}
                      />
                    

                    
                       (
                          
                            Partner Account Manager
                            
                              
                            
                            
                          
                        )}
                      />

                       (
                          
                            Delivery Method
                            
                              
                                
                                  
                                
                              
                              
                                API Integration
                                CSV File
                                Real-time Push
                                SFTP
                                Email
                              
                            
                            
                          
                        )}
                      />
                    
                  
                
              
            )}

            {/* Direct Sales Fields */}
            {isDirectSales && (
              <>
                
                  Sales Details
                  
                  
                    
                       (
                          
                            Contract Type
                            
                              
                                
                                  
                                
                              
                              
                                Retainer
                                One-time
                                Subscription
                                Per Project
                              
                            
                            
                          
                        )}
                      />

                       (
                          
                            Estimated Deal Value ($)
                            
                              
                            
                            
                          
                        )}
                      />
                    

                    
                       (
                          
                            Intent Score (0-100)
                            
                               {
                                  const value = e.target.value;
                                  field.onChange(value === '' ? undefined : parseInt(value));
                                }}
                                data-testid="input-intent-score"
                              />
                            
                            AI-powered buying intent signal
                            
                          
                        )}
                      />

                       (
                          
                            Lead Source
                            
                              
                            
                            
                          
                        )}
                      />
                    
                  
                
              
            )}

            
               onOpenChange(false)}
              >
                Cancel
              
              
                {createMutation.isPending && (
                  
                )}
                {isEditing ? "Update" : "Create"} Opportunity
              
            
          
        
      
    
  );
}