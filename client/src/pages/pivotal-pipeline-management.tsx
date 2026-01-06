import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPipelineOpportunitySchema, type Pipeline, type PipelineOpportunity } from "@shared/schema";

type Account = {
  id: string;
  name: string;
};

type Contact = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
};
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Plus, DollarSign, Calendar, User, Building2, LayoutGrid, List, TrendingUp, AlertCircle, Target } from "lucide-react";
import { z } from "zod";
import { StatCard } from "@/components/shared/stat-card";

type OpportunityWithRelations = PipelineOpportunity & {
  account?: { name: string } | null;
  contact?: { firstName: string; lastName: string } | null;
};

type ViewMode = "kanban" | "list" | "forecast";

export default function PivotalPipelineManagementPage() {
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>("");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [draggedOpportunity, setDraggedOpportunity] = useState<OpportunityWithRelations | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();

  const { data: pipelines = [] } = useQuery<Pipeline[]>({
    queryKey: ["/api/pipelines"],
  });

  const { data: opportunities = [] } = useQuery<OpportunityWithRelations[]>({
    queryKey: ["/api/pipelines", selectedPipelineId, "opportunities"],
    enabled: !!selectedPipelineId,
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: contacts = [] } = useQuery<Contact[]>({
    queryKey: ["/api/contacts"],
  });

  const selectedPipeline = pipelines.find(p => p.id === selectedPipelineId);
  const stages = selectedPipeline?.stageOrder || [];

  const createMutation = useMutation({
    mutationFn: async (data: z.infer<typeof insertPipelineOpportunitySchema>) => {
      return apiRequest("POST", "/api/opportunities", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", selectedPipelineId, "opportunities"] });
      toast({ title: "Success", description: "Opportunity created successfully" });
      setDialogOpen(false);
      form.reset();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create opportunity", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ opportunityId, data }: { opportunityId: string; data: Partial<PipelineOpportunity> }) => {
      return apiRequest("PUT", `/api/opportunities/${opportunityId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pipelines", selectedPipelineId, "opportunities"] });
      toast({ title: "Success", description: "Opportunity updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update opportunity", variant: "destructive" });
    },
  });

  const form = useForm<z.infer<typeof insertPipelineOpportunitySchema>>({
    resolver: zodResolver(insertPipelineOpportunitySchema),
    defaultValues: {
      pipelineId: selectedPipelineId,
      name: "",
      accountId: undefined,
      contactId: undefined,
      stage: stages[0] || "Prospecting",
      status: "open",
      amount: "0",
      currency: selectedPipeline?.defaultCurrency || "USD",
      probability: 0,
      forecastCategory: "Pipeline",
      flaggedForSla: false,
    },
  });

  // Reset form when pipeline changes
  useEffect(() => {
    if (selectedPipeline) {
      form.reset({
        pipelineId: selectedPipelineId,
        name: "",
        accountId: undefined,
        contactId: undefined,
        stage: stages[0] || "Prospecting",
        status: "open",
        amount: "0",
        currency: selectedPipeline.defaultCurrency || "USD",
        probability: 0,
        forecastCategory: "Pipeline",
        flaggedForSla: false,
      });
    }
  }, [selectedPipelineId, selectedPipeline, stages, form]);

  const handleDragStart = (opportunity: OpportunityWithRelations) => {
    setDraggedOpportunity(opportunity);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (newStage: string) => {
    if (draggedOpportunity && draggedOpportunity.stage !== newStage) {
      updateMutation.mutate({
        opportunityId: draggedOpportunity.id,
        data: { stage: newStage },
      });
    }
    setDraggedOpportunity(null);
  };

  const handleCreateOpportunity = (data: z.infer<typeof insertPipelineOpportunitySchema>) => {
    createMutation.mutate({
      ...data,
      pipelineId: selectedPipelineId,
    });
  };

  const groupedOpportunities = stages.reduce((acc, stage) => {
    acc[stage] = opportunities.filter(opp => opp.stage === stage);
    return acc;
  }, {} as Record<string, OpportunityWithRelations[]>);

  // Helper function to safely parse amounts
  const safeParseAmount = (amount: string | null | undefined): number => {
    if (!amount) return 0;
    const parsed = parseFloat(amount);
    return isNaN(parsed) ? 0 : parsed;
  };

  // Calculate pipeline metrics
  const pipelineMetrics = useMemo(() => {
    const totalValue = opportunities.reduce((sum, opp) => sum + safeParseAmount(opp.amount), 0);
    const dealCount = opportunities.length;
    const avgProbability = dealCount > 0
      ? opportunities.reduce((sum, opp) => sum + (opp.probability || 0), 0) / dealCount
      : 0;
    const openDeals = opportunities.filter(opp => opp.status === "open").length;
    const wonDeals = opportunities.filter(opp => opp.status === "won").length;
    const winRate = dealCount > 0 ? (wonDeals / dealCount) * 100 : 0;
    
    // Calculate weighted value (amount * probability)
    const weightedValue = opportunities.reduce((sum, opp) => {
      const amount = safeParseAmount(opp.amount);
      const probability = (opp.probability || 0) / 100;
      return sum + (amount * probability);
    }, 0);

    return {
      totalValue,
      dealCount,
      avgProbability,
      openDeals,
      wonDeals,
      winRate,
      weightedValue,
    };
  }, [opportunities]);

  if (pipelines.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>No Pipelines Found</CardTitle>
            <CardDescription>
              Create a pipeline to start managing opportunities
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (!selectedPipelineId && pipelines.length > 0) {
    setSelectedPipelineId(pipelines[0].id);
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold" data-testid="text-page-title">Pipeline Management</h1>
          <p className="text-muted-foreground">Manage your sales pipeline and opportunities</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="button-new-opportunity">
              <Plus className="mr-2 h-4 w-4" />
              New Opportunity
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Opportunity</DialogTitle>
              <DialogDescription>Add a new opportunity to your pipeline</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleCreateOpportunity)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Opportunity name" data-testid="input-opportunity-name" />
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
                      <FormLabel>Account (Optional)</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} 
                        value={field.value || undefined}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-account">
                            <SelectValue placeholder="Select account" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
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
                      <FormLabel>Contact (Optional)</FormLabel>
                      <Select 
                        onValueChange={(value) => field.onChange(value === "none" ? undefined : value)} 
                        value={field.value || undefined}
                      >
                        <FormControl>
                          <SelectTrigger data-testid="select-contact">
                            <SelectValue placeholder="Select contact" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {contacts.map((contact) => (
                            <SelectItem key={contact.id} value={contact.id}>
                              {[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email}
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
                  name="stage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Stage</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-stage">
                            <SelectValue placeholder="Select stage" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {stages.map((stage) => (
                            <SelectItem key={stage} value={stage}>
                              {stage}
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
                  name="amount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Amount</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" placeholder="0" data-testid="input-amount" />
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
                          {...field}
                          type="number"
                          min="0"
                          max="100"
                          value={field.value ?? 0}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          data-testid="input-probability"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="reason"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea {...field} value={field.value || ""} placeholder="Additional notes..." data-testid="input-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} data-testid="button-cancel">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending} data-testid="button-create">
                    {createMutation.isPending ? "Creating..." : "Create"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex items-center gap-4">
        <Select value={selectedPipelineId} onValueChange={setSelectedPipelineId}>
          <SelectTrigger className="w-64" data-testid="select-pipeline">
            <SelectValue placeholder="Select pipeline" />
          </SelectTrigger>
          <SelectContent>
            {pipelines.map((pipeline) => (
              <SelectItem key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedPipeline && (
          <p className="text-sm text-muted-foreground">
            {selectedPipeline.description || "No description"}
          </p>
        )}
      </div>

      {/* Pipeline Metrics Dashboard */}
      {selectedPipelineId && opportunities.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Pipeline Value"
            value={`${selectedPipeline?.defaultCurrency || 'USD'} ${pipelineMetrics.totalValue.toLocaleString()}`}
            icon={DollarSign}
            description={`Weighted: ${selectedPipeline?.defaultCurrency || 'USD'} ${pipelineMetrics.weightedValue.toLocaleString()}`}
            data-testid="stat-total-value"
          />
          <StatCard
            title="Active Opportunities"
            value={pipelineMetrics.openDeals}
            icon={Target}
            description={`${pipelineMetrics.dealCount} total deals`}
            data-testid="stat-open-deals"
          />
          <StatCard
            title="Average Probability"
            value={`${Math.round(pipelineMetrics.avgProbability)}%`}
            icon={TrendingUp}
            description="Across all opportunities"
            data-testid="stat-avg-probability"
          />
          <StatCard
            title="Win Rate"
            value={`${Math.round(pipelineMetrics.winRate)}%`}
            icon={Building2}
            description={`${pipelineMetrics.wonDeals} won deals`}
            data-testid="stat-win-rate"
          />
        </div>
      )}

      {/* Multi-View Pipeline Display */}
      <Tabs value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)} className="w-full">
        <TabsList data-testid="tabs-view-mode">
          <TabsTrigger value="kanban" data-testid="tab-kanban">
            <LayoutGrid className="h-4 w-4 mr-2" />
            Kanban
          </TabsTrigger>
          <TabsTrigger value="list" data-testid="tab-list">
            <List className="h-4 w-4 mr-2" />
            List
          </TabsTrigger>
          <TabsTrigger value="forecast" data-testid="tab-forecast">
            <TrendingUp className="h-4 w-4 mr-2" />
            Forecast
          </TabsTrigger>
        </TabsList>

        {/* Kanban View */}
        <TabsContent value="kanban" className="mt-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {stages.map((stage) => (
          <div
            key={stage}
            className="flex flex-col gap-3"
            onDragOver={handleDragOver}
            onDrop={() => handleDrop(stage)}
          >
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg" data-testid={`text-stage-${stage}`}>{stage}</CardTitle>
                <CardDescription>{groupedOpportunities[stage]?.length || 0} opportunities</CardDescription>
              </CardHeader>
            </Card>

            <div className="space-y-3" data-testid={`column-${stage}`}>
              {groupedOpportunities[stage]?.map((opportunity) => (
                <Card
                  key={opportunity.id}
                  className="cursor-move hover-elevate active-elevate-2"
                  draggable
                  onDragStart={() => handleDragStart(opportunity)}
                  data-testid={`card-opportunity-${opportunity.id}`}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm" data-testid={`text-opportunity-name-${opportunity.id}`}>
                      {opportunity.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span data-testid={`text-opportunity-amount-${opportunity.id}`}>
                        {opportunity.currency} {safeParseAmount(opportunity.amount).toLocaleString()}
                      </span>
                    </div>
                    {opportunity.account && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Building2 className="h-4 w-4" />
                        <span data-testid={`text-opportunity-account-${opportunity.id}`}>
                          {opportunity.account.name}
                        </span>
                      </div>
                    )}
                    {opportunity.contact && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-4 w-4" />
                        <span data-testid={`text-opportunity-contact-${opportunity.id}`}>
                          {[opportunity.contact.firstName, opportunity.contact.lastName].filter(Boolean).join(" ")}
                        </span>
                      </div>
                    )}
                    {opportunity.closeDate && (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="h-4 w-4" />
                        <span data-testid={`text-opportunity-closedate-${opportunity.id}`}>
                          {new Date(opportunity.closeDate).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground" data-testid={`text-opportunity-probability-${opportunity.id}`}>
                      {opportunity.probability}% probability
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
        </TabsContent>

        {/* List View */}
        <TabsContent value="list" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>All Opportunities</CardTitle>
              <CardDescription>{opportunities.length} opportunities in pipeline</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Probability</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {opportunities.map((opportunity) => (
                    <TableRow key={opportunity.id} data-testid={`row-opportunity-${opportunity.id}`}>
                      <TableCell className="font-medium">{opportunity.name}</TableCell>
                      <TableCell>{opportunity.account?.name || "-"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{opportunity.stage}</Badge>
                      </TableCell>
                      <TableCell>{opportunity.currency} {safeParseAmount(opportunity.amount).toLocaleString()}</TableCell>
                      <TableCell>{opportunity.probability}%</TableCell>
                      <TableCell>
                        <Badge variant={opportunity.status === "won" ? "default" : opportunity.status === "lost" ? "destructive" : "secondary"}>
                          {opportunity.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Forecast View */}
        <TabsContent value="forecast" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Pipeline by Stage</CardTitle>
                <CardDescription>Value distribution across stages</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {stages.map((stage) => {
                    const stageOpps = groupedOpportunities[stage] || [];
                    const stageValue = stageOpps.reduce((sum, opp) => sum + safeParseAmount(opp.amount), 0);
                    const stageWeightedValue = stageOpps.reduce((sum, opp) => {
                      const amount = safeParseAmount(opp.amount);
                      const probability = (opp.probability || 0) / 100;
                      return sum + (amount * probability);
                    }, 0);
                    
                    return (
                      <div key={stage} className="space-y-2" data-testid={`forecast-stage-${stage}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{stage}</span>
                          <span className="text-sm text-muted-foreground">{stageOpps.length} deals</span>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span>Total: {selectedPipeline?.defaultCurrency || 'USD'} {stageValue.toLocaleString()}</span>
                          <span className="text-muted-foreground">Weighted: {selectedPipeline?.defaultCurrency || 'USD'} {stageWeightedValue.toLocaleString()}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Forecast Summary</CardTitle>
                <CardDescription>Weighted pipeline forecast</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <span className="font-medium">Best Case</span>
                    <span className="text-lg font-bold">{selectedPipeline?.defaultCurrency || 'USD'} {pipelineMetrics.totalValue.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-primary/10">
                    <span className="font-medium">Most Likely</span>
                    <span className="text-lg font-bold text-primary">{selectedPipeline?.defaultCurrency || 'USD'} {pipelineMetrics.weightedValue.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
                    <span className="font-medium">Committed</span>
                    <span className="text-lg font-bold">
                      {selectedPipeline?.defaultCurrency || 'USD'} {opportunities.filter(o => o.probability >= 80).reduce((sum, o) => sum + safeParseAmount(o.amount), 0).toLocaleString()}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
