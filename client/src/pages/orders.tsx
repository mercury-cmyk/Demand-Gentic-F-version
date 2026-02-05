import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, Download, BarChart3, Link as LinkIcon, Loader2, Filter, X, Wand2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CampaignCreationWizard } from "@/components/client-portal/campaigns/campaign-creation-wizard";
import { EmptyState } from "@/components/shared/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { insertCampaignOrderSchema, type CampaignOrder } from "@shared/schema";
import { CampaignLinkDialog } from "@/components/campaign-link-dialog";
import { SidebarFilters } from "@/components/filters/sidebar-filters";
import type { FilterGroup } from "@shared/filter-types";

const orderFormSchema = insertCampaignOrderSchema.extend({
  orderNumber: z.string().min(1, "Order number required"),
  type: z.enum(['email', 'call', 'combo']),
  leadGoal: z.coerce.number().min(1, "Lead goal must be at least 1"),
  audienceNotes: z.string().optional(),
  qualificationCriteria: z.string().optional(),
});

type OrderFormData = z.infer<typeof orderFormSchema>;

export default function OrdersPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [selectedOrderForWizard, setSelectedOrderForWizard] = useState<CampaignOrder | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedOrderForLink, setSelectedOrderForLink] = useState<CampaignOrder | null>(null);
  const [filterGroup, setFilterGroup] = useState<FilterGroup | undefined>(undefined);
  const { toast } = useToast();
  const { user } = useAuth();

  const { data: orders = [], isLoading } = useQuery<CampaignOrder[]>({
    queryKey: ['/api/orders'],
  });

  const form = useForm<OrderFormData>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      clientUserId: user?.id || '',
      orderNumber: `ORD-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
      type: 'email',
      status: 'draft',
      leadGoal: 100,
      audienceNotes: '',
      qualificationCriteria: '',
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: OrderFormData) => {
      return await apiRequest('POST', '/api/orders', data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'], refetchType: 'active' });
      setCreateDialogOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Order created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create order",
        variant: "destructive",
      });
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest('POST', `/api/orders/${id}/submit`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/orders'], refetchType: 'active' });
      toast({
        title: "Success",
        description: "Order submitted for processing",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit order",
        variant: "destructive",
      });
    },
  });

  const getStatusBadge = (status: string) => {
    const config: Record<string, { variant: "default" | "secondary" | "outline" | "destructive"; label: string }> = {
      draft: { variant: "secondary", label: "Draft" },
      submitted: { variant: "default", label: "Submitted" },
      in_progress: { variant: "outline", label: "In Progress" },
      completed: { variant: "outline", label: "Completed" },
    };
    const { variant, label } = config[status] || config.draft;
    return <Badge variant={variant} data-testid={`badge-status-${status}`}>{label}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const config: Record<string, { label: string }> = {
      email: { label: "Email" },
      call: { label: "Telemarketing" },
      combo: { label: "Email + Calls" },
    };
    const { label } = config[type] || config.email;
    return <Badge variant="secondary">{label}</Badge>;
  };

  const onSubmit = (data: OrderFormData) => {
    createMutation.mutate(data);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-9 w-64 mb-2" />
            <Skeleton className="h-5 w-96" />
          </div>
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-8 w-48 mb-2" />
                <Skeleton className="h-5 w-64" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col xl:flex-row overflow-hidden">
      <SidebarFilters
        entityType="order"
        onApplyFilter={setFilterGroup}
        initialFilter={filterGroup}
        includeRelatedEntities={false}
      />
      <div className="flex-1 overflow-auto">
        <div className="space-y-6 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold" data-testid="heading-orders">Campaign Orders</h1>
              <p className="text-muted-foreground mt-1">
                Manage your campaign orders and track lead delivery
              </p>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => {
                  setSelectedOrderForWizard(null);
                  setWizardOpen(true);
              }} variant="outline">
                  <Wand2 className="mr-2 h-4 w-4" />
                  Wizard
              </Button>
              <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-order">
                <Plus className="mr-2 h-4 w-4" />
                New Order
              </Button>
            </div>
          </div>

          {/* Active Filters Badge */}
          {filterGroup && filterGroup.filters.length > 0 && (
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="flex items-center gap-1">
                <Filter className="h-3 w-3" />
                {filterGroup.filters.length} filter{filterGroup.filters.length !== 1 ? 's' : ''} active
              </Badge>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setFilterGroup(undefined)}
                className="h-6 px-2 text-xs"
              >
                <X className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </div>
          )}

          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search orders..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                data-testid="input-search-orders"
              />
            </div>
          </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={Plus}
          title="No orders yet"
          description="Create your first campaign order to get started"
          action={
            <Button onClick={() => setCreateDialogOpen(true)} data-testid="button-create-first-order">
              <Plus className="mr-2 h-4 w-4" />
              Create Order
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {orders.map((order) => (
            <Card key={order.id} className="hover-elevate" data-testid={`card-order-${order.id}`}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <CardTitle data-testid={`text-order-number-${order.id}`}>{order.orderNumber}</CardTitle>
                      {getStatusBadge(order.status)}
                      {getTypeBadge(order.type)}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Created {new Date(order.createdAt).toLocaleDateString()} • Lead Goal: {order.leadGoal}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {order.status === 'draft' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => submitMutation.mutate(order.id)}
                        disabled={submitMutation.isPending}
                        data-testid={`button-submit-${order.id}`}
                      >
                        {submitMutation.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        Submit Order
                      </Button>
                    )}
                    {(order.status === 'submitted' || order.status === 'in_progress') && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          setSelectedOrderForLink(order);
                          setLinkDialogOpen(true);
                        }}
                        data-testid={`button-link-campaigns-${order.id}`}
                      >
                        <LinkIcon className="mr-2 h-4 w-4" />
                        Link Campaigns
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedOrderForWizard(order);
                        setWizardOpen(true);
                      }}
                    >
                      <Wand2 className="mr-2 h-4 w-4" />
                      Create Campaign
                    </Button>
                    <Button variant="outline" size="sm" data-testid={`button-view-${order.id}`}>
                      <BarChart3 className="mr-2 h-4 w-4" />
                      View Details
                    </Button>
                  </div>
                </div>
              </CardHeader>
              {order.audienceNotes && (
                <CardContent>
                  <p className="text-sm text-muted-foreground">{order.audienceNotes}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-2xl" data-testid="dialog-create-order">
          <DialogHeader>
            <DialogTitle>Create Campaign Order</DialogTitle>
            <DialogDescription>
              Define your campaign requirements and lead goals
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="orderNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Order Number</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-order-number" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Campaign Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-campaign-type">
                          <SelectValue placeholder="Select campaign type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="email">Email Only</SelectItem>
                        <SelectItem value="call">Telemarketing Only</SelectItem>
                        <SelectItem value="combo">Email + Telemarketing</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="leadGoal"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lead Goal</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        {...field}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                        data-testid="input-lead-goal"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="audienceNotes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Audience Definition (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Describe your target audience..."
                        rows={3}
                        data-testid="textarea-audience-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="qualificationCriteria"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Qualification Criteria (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        {...field}
                        placeholder="Define lead qualification requirements..."
                        rows={3}
                        data-testid="textarea-qualification-criteria"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreateDialogOpen(false)}
                  data-testid="button-cancel-order"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                  data-testid="button-save-order"
                >
                  {createMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Order
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {selectedOrderForLink && (
        <CampaignLinkDialog
          open={linkDialogOpen}
          onOpenChange={setLinkDialogOpen}
          orderId={selectedOrderForLink.id}
          orderNumber={selectedOrderForLink.orderNumber}
        />
      )}

      <CampaignCreationWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        mode="admin"
        clientAccountId={selectedOrderForWizard?.clientAccountId}
        initialData={selectedOrderForWizard ? {
            name: selectedOrderForWizard.title || `Campaign from Order ${selectedOrderForWizard.orderNumber}`,
            description: selectedOrderForWizard.description || '',
            targetLeadCount: selectedOrderForWizard.targetLeadCount || undefined,
            budget: selectedOrderForWizard.estimatedBudget ? parseFloat(selectedOrderForWizard.estimatedBudget) : undefined,
            // Map validation logic or pre-fill other fields if order has config
            ...((selectedOrderForWizard.campaignConfig as any) || {}),
            targetIndustries: selectedOrderForWizard.targetIndustries || [],
            targetTitles: selectedOrderForWizard.targetTitles || [],
            targetRegions: selectedOrderForWizard.targetRegions || [],
        } : undefined}
      />
        </div>
      </div>
    </div>
  );
}
