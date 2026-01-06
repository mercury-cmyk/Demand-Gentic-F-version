
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

type OpportunityFormData = z.infer<typeof opportunitySchema>;

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

  const { data: pipeline } = useQuery<Pipeline>({
    queryKey: [`/api/pipelines/${pipelineId}`],
    enabled: !!pipelineId,
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const isMediaPartnership = pipeline?.category === 'media_partnership';
  const isDirectSales = pipeline?.category === 'direct_sales';

  const form = useForm<OpportunityFormData>({
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Opportunity" : "Create Opportunity"}
          </DialogTitle>
          <DialogDescription>
            Add a new deal to your pipeline
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Opportunity Name</FormLabel>
                  <FormControl>
                    <Input placeholder="Q1 Enterprise License" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="accountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select account" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {accounts.map((account) => (
                        <SelectItem key={account.id} value={account.id}>
                          {account.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="contactId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Primary Contact (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select contact" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {filteredContacts.map((contact) => (
                        <SelectItem key={contact.id} value={contact.id}>
                          {contact.fullName} - {contact.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Contacts filtered by selected account
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Amount</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="50000"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="probability"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Probability (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        placeholder="50"
                        {...field}
                        onChange={(e) =>
                          field.onChange(parseInt(e.target.value) || 0)
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="stage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stage</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="qualification">
                          Qualification
                        </SelectItem>
                        <SelectItem value="proposal">Proposal</SelectItem>
                        <SelectItem value="negotiation">Negotiation</SelectItem>
                        <SelectItem value="closedWon">Closed Won</SelectItem>
                        <SelectItem value="closedLost">Closed Lost</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="closeDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Expected Close Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason / Notes (Optional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Additional details about this opportunity..."
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Media & Data Partnership Fields */}
            {isMediaPartnership && (
              <>
                <div className="border-t pt-4 mt-2">
                  <h3 className="text-sm font-medium mb-3">Partnership Details</h3>
                  
                  <div className="space-y-4">
                    <FormField
                      control={form.control}
                      name="partnerName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Partner Name</FormLabel>
                          <FormControl>
                            <Input placeholder="Acme Media Co." {...field} data-testid="input-partner-name" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="partnershipType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Partnership Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-partnership-type">
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="publisher">Publisher</SelectItem>
                                <SelectItem value="data_provider">Data Provider</SelectItem>
                                <SelectItem value="syndication_network">Syndication Network</SelectItem>
                                <SelectItem value="media_buyer">Media Buyer</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="pricingModel"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Pricing Model</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-pricing-model">
                                  <SelectValue placeholder="Select model" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="cpl">CPL - Cost Per Lead</SelectItem>
                                <SelectItem value="cpc">CPC - Cost Per Contact</SelectItem>
                                <SelectItem value="hybrid">Hybrid Model</SelectItem>
                                <SelectItem value="flat_fee">Flat Fee</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="costPerLead"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cost Per Lead ($)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="25.00" {...field} data-testid="input-cost-per-lead" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="costPerContact"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Cost Per Contact ($)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="15.00" {...field} data-testid="input-cost-per-contact" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="leadVolumeGoal"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Lead Volume Goal</FormLabel>
                            <FormControl>
                              <Input type="number" placeholder="1000" {...field} data-testid="input-lead-volume-goal" />
                            </FormControl>
                            <FormDescription>Monthly lead target</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="qualityTier"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Quality Tier</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-quality-tier">
                                  <SelectValue placeholder="Select tier" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="verified">Verified</SelectItem>
                                <SelectItem value="unverified">Unverified</SelectItem>
                                <SelectItem value="data_append">Data Append</SelectItem>
                                <SelectItem value="premium">Premium</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="partnerAccountManager"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Partner Account Manager</FormLabel>
                            <FormControl>
                              <Input placeholder="John Doe" {...field} data-testid="input-partner-account-manager" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="deliveryMethod"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Delivery Method</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-delivery-method">
                                  <SelectValue placeholder="Select method" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="api">API Integration</SelectItem>
                                <SelectItem value="csv">CSV File</SelectItem>
                                <SelectItem value="realtime_push">Real-time Push</SelectItem>
                                <SelectItem value="sftp">SFTP</SelectItem>
                                <SelectItem value="email">Email</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* Direct Sales Fields */}
            {isDirectSales && (
              <>
                <div className="border-t pt-4 mt-2">
                  <h3 className="text-sm font-medium mb-3">Sales Details</h3>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="contractType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Contract Type</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger data-testid="select-contract-type">
                                  <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="retainer">Retainer</SelectItem>
                                <SelectItem value="one_time">One-time</SelectItem>
                                <SelectItem value="subscription">Subscription</SelectItem>
                                <SelectItem value="per_project">Per Project</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="estimatedDealValue"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Estimated Deal Value ($)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" placeholder="100000" {...field} data-testid="input-estimated-deal-value" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="intentScore"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Intent Score (0-100)</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                placeholder="75"
                                value={field.value !== undefined ? field.value : ''}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  field.onChange(value === '' ? undefined : parseInt(value));
                                }}
                                data-testid="input-intent-score"
                              />
                            </FormControl>
                            <FormDescription>AI-powered buying intent signal</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="leadSource"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Lead Source</FormLabel>
                            <FormControl>
                              <Input placeholder="Inbound Marketing" {...field} data-testid="input-lead-source" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </div>
                </div>
              </>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isEditing ? "Update" : "Create"} Opportunity
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
