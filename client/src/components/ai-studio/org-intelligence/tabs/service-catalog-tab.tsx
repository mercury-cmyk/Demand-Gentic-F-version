import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Package,
  Target,
  Star,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const SERVICE_CATEGORIES = [
  { value: "platform", label: "Platform" },
  { value: "consulting", label: "Consulting" },
  { value: "integration", label: "Integration" },
  { value: "support", label: "Support" },
  { value: "training", label: "Training" },
  { value: "other", label: "Other" },
];

interface ProblemSolved {
  id: string;
  problemStatement: string;
  symptoms: Array<{ id: string; symptomDescription: string; dataSource: string }>;
  impactAreas: Array<{ id: string; area: string; description: string; severity: string }>;
  severity: string;
}

interface ServiceDifferentiator {
  id: string;
  claim: string;
  proof: string;
  competitorGap?: string;
}

interface ValueProposition {
  id: string;
  headline: string;
  description: string;
  targetPersona?: string;
  quantifiedValue?: string;
}

interface ServiceDefinition {
  id: number;
  serviceName: string;
  serviceCategory: string;
  serviceDescription: string | null;
  problemsSolved: ProblemSolved[];
  differentiators: ServiceDifferentiator[];
  valuePropositions: ValueProposition[];
  targetIndustries: string[] | null;
  targetPersonas: string[] | null;
  displayOrder: number;
  isActive: boolean;
}

interface ServiceCatalogTabProps {
  organizationId: string | null;
}

export function ServiceCatalogTab({ organizationId }: ServiceCatalogTabProps) {
  const queryClient = useQueryClient();
  const [isServiceDialogOpen, setIsServiceDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<ServiceDefinition | null>(null);
  const [isProblemDialogOpen, setIsProblemDialogOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState<number | null>(null);

  const [serviceForm, setServiceForm] = useState({
    serviceName: "",
    serviceCategory: "other",
    serviceDescription: "",
    targetIndustries: "",
    targetPersonas: "",
  });

  const [problemForm, setProblemForm] = useState({
    problemStatement: "",
    severity: "medium",
  });

  const { data: servicesData, isLoading } = useQuery<{ services: ServiceDefinition[] }>({
    queryKey: ["/api/service-catalog", organizationId ? `?organizationId=${organizationId}` : ""],
    enabled: !!organizationId,
  });

  const createServiceMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/service-catalog", {
        ...data,
        organizationId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
      setIsServiceDialogOpen(false);
      resetServiceForm();
    },
  });

  const updateServiceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await apiRequest("PUT", `/api/service-catalog/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
      setIsServiceDialogOpen(false);
      resetServiceForm();
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/service-catalog/${id}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
    },
  });

  const addProblemMutation = useMutation({
    mutationFn: async ({ serviceId, data }: { serviceId: number; data: any }) => {
      const response = await apiRequest("POST", `/api/service-catalog/${serviceId}/problems`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
      setIsProblemDialogOpen(false);
      resetProblemForm();
    },
  });

  const resetServiceForm = () => {
    setServiceForm({
      serviceName: "",
      serviceCategory: "other",
      serviceDescription: "",
      targetIndustries: "",
      targetPersonas: "",
    });
    setEditingService(null);
  };

  const resetProblemForm = () => {
    setProblemForm({
      problemStatement: "",
      severity: "medium",
    });
    setSelectedServiceId(null);
  };

  const handleEditService = (service: ServiceDefinition) => {
    setEditingService(service);
    setServiceForm({
      serviceName: service.serviceName,
      serviceCategory: service.serviceCategory || "other",
      serviceDescription: service.serviceDescription || "",
      targetIndustries: service.targetIndustries?.join(", ") || "",
      targetPersonas: service.targetPersonas?.join(", ") || "",
    });
    setIsServiceDialogOpen(true);
  };

  const handleSubmitService = () => {
    const data = {
      serviceName: serviceForm.serviceName,
      serviceCategory: serviceForm.serviceCategory,
      serviceDescription: serviceForm.serviceDescription || null,
      targetIndustries: serviceForm.targetIndustries
        ? serviceForm.targetIndustries.split(",").map((s) => s.trim())
        : null,
      targetPersonas: serviceForm.targetPersonas
        ? serviceForm.targetPersonas.split(",").map((s) => s.trim())
        : null,
    };

    if (editingService) {
      updateServiceMutation.mutate({ id: editingService.id, data });
    } else {
      createServiceMutation.mutate(data);
    }
  };

  const handleAddProblem = (serviceId: number) => {
    setSelectedServiceId(serviceId);
    setIsProblemDialogOpen(true);
  };

  const handleSubmitProblem = () => {
    if (!selectedServiceId) return;
    addProblemMutation.mutate({
      serviceId: selectedServiceId,
      data: problemForm,
    });
  };

  if (!organizationId) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-muted-foreground">Please select an organization to view the service catalog.</p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  const services = servicesData?.services || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Service Catalog</h3>
          <p className="text-sm text-muted-foreground">
            Define your organization's services and the problems they solve.
          </p>
        </div>
        <Button onClick={() => setIsServiceDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Service
        </Button>
      </div>

      {services.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h4 className="text-lg font-medium mb-2">No Services Yet</h4>
            <p className="text-muted-foreground mb-4">
              Start by adding your organization's services to build your problem intelligence system.
            </p>
            <Button onClick={() => setIsServiceDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Service
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {services.map((service) => (
            <Card key={service.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <CardTitle className="text-lg">{service.serviceName}</CardTitle>
                      <Badge variant="secondary" className="text-xs">
                        {SERVICE_CATEGORIES.find((c) => c.value === service.serviceCategory)?.label ||
                          service.serviceCategory}
                      </Badge>
                    </div>
                    {service.serviceDescription && (
                      <CardDescription>{service.serviceDescription}</CardDescription>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleEditService(service)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteServiceMutation.mutate(service.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="problems" className="border-none">
                    <AccordionTrigger className="hover:no-underline py-2">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4 text-blue-500" />
                        <span className="text-sm font-medium">
                          Problems Solved ({service.problemsSolved.length})
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 pt-2">
                        {service.problemsSolved.length === 0 ? (
                          <p className="text-sm text-muted-foreground pl-6">
                            No problems defined yet.
                          </p>
                        ) : (
                          service.problemsSolved.map((problem) => (
                            <div
                              key={problem.id}
                              className="flex items-start gap-2 pl-6 py-2 hover:bg-muted/50 rounded"
                            >
                              <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground" />
                              <div>
                                <p className="text-sm">{problem.problemStatement}</p>
                                <Badge
                                  variant={
                                    problem.severity === "critical"
                                      ? "destructive"
                                      : problem.severity === "high"
                                      ? "default"
                                      : "secondary"
                                  }
                                  className="text-[10px] mt-1"
                                >
                                  {problem.severity}
                                </Badge>
                              </div>
                            </div>
                          ))
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-6 text-primary"
                          onClick={() => handleAddProblem(service.id)}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Add Problem
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="differentiators" className="border-none">
                    <AccordionTrigger className="hover:no-underline py-2">
                      <div className="flex items-center gap-2">
                        <Star className="h-4 w-4 text-yellow-500" />
                        <span className="text-sm font-medium">
                          Differentiators ({service.differentiators.length})
                        </span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2 pt-2">
                        {service.differentiators.length === 0 ? (
                          <p className="text-sm text-muted-foreground pl-6">
                            No differentiators defined yet.
                          </p>
                        ) : (
                          service.differentiators.map((diff) => (
                            <div
                              key={diff.id}
                              className="pl-6 py-2 hover:bg-muted/50 rounded space-y-1"
                            >
                              <p className="text-sm font-medium">{diff.claim}</p>
                              <p className="text-xs text-muted-foreground">Proof: {diff.proof}</p>
                              {diff.competitorGap && (
                                <p className="text-xs text-muted-foreground">
                                  Gap: {diff.competitorGap}
                                </p>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                {(service.targetIndustries?.length || service.targetPersonas?.length) && (
                  <div className="flex flex-wrap gap-4 mt-4 pt-4 border-t text-xs text-muted-foreground">
                    {service.targetIndustries?.length && (
                      <div>
                        <span className="font-medium">Industries: </span>
                        {service.targetIndustries.join(", ")}
                      </div>
                    )}
                    {service.targetPersonas?.length && (
                      <div>
                        <span className="font-medium">Personas: </span>
                        {service.targetPersonas.join(", ")}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Service Dialog */}
      <Dialog open={isServiceDialogOpen} onOpenChange={setIsServiceDialogOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>{editingService ? "Edit Service" : "Add Service"}</DialogTitle>
            <DialogDescription>
              {editingService
                ? "Update the service details."
                : "Define a new service in your catalog."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="serviceName">Service Name *</Label>
              <Input
                id="serviceName"
                value={serviceForm.serviceName}
                onChange={(e) => setServiceForm({ ...serviceForm, serviceName: e.target.value })}
                placeholder="Enterprise Platform"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="serviceCategory">Category</Label>
              <Select
                value={serviceForm.serviceCategory}
                onValueChange={(value) => setServiceForm({ ...serviceForm, serviceCategory: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SERVICE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="serviceDescription">Description</Label>
              <Textarea
                id="serviceDescription"
                value={serviceForm.serviceDescription}
                onChange={(e) =>
                  setServiceForm({ ...serviceForm, serviceDescription: e.target.value })
                }
                placeholder="Describe what this service does..."
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="targetIndustries">Target Industries</Label>
              <Input
                id="targetIndustries"
                value={serviceForm.targetIndustries}
                onChange={(e) =>
                  setServiceForm({ ...serviceForm, targetIndustries: e.target.value })
                }
                placeholder="SaaS, Healthcare, Finance (comma-separated)"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="targetPersonas">Target Personas</Label>
              <Input
                id="targetPersonas"
                value={serviceForm.targetPersonas}
                onChange={(e) => setServiceForm({ ...serviceForm, targetPersonas: e.target.value })}
                placeholder="CTO, VP Engineering, IT Director (comma-separated)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsServiceDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitService}
              disabled={
                !serviceForm.serviceName ||
                createServiceMutation.isPending ||
                updateServiceMutation.isPending
              }
            >
              {(createServiceMutation.isPending || updateServiceMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingService ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Problem Dialog */}
      <Dialog open={isProblemDialogOpen} onOpenChange={setIsProblemDialogOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Add Problem</DialogTitle>
            <DialogDescription>
              Define a problem that this service helps solve.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="problemStatement">Problem Statement *</Label>
              <Textarea
                id="problemStatement"
                value={problemForm.problemStatement}
                onChange={(e) =>
                  setProblemForm({ ...problemForm, problemStatement: e.target.value })
                }
                placeholder="Describe the problem your customers face..."
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="severity">Severity</Label>
              <Select
                value={problemForm.severity}
                onValueChange={(value) => setProblemForm({ ...problemForm, severity: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsProblemDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitProblem}
              disabled={!problemForm.problemStatement || addProblemMutation.isPending}
            >
              {addProblemMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Add Problem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
