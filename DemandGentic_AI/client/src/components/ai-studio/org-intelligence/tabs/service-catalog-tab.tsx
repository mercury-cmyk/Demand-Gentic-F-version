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
  symptoms: Array;
  impactAreas: Array;
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
  const [editingService, setEditingService] = useState(null);
  const [isProblemDialogOpen, setIsProblemDialogOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState(null);

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

  const { data: servicesData, isLoading } = useQuery({
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
      
        
          Please select an organization to view the service catalog.
        
      
    );
  }

  if (isLoading) {
    return (
      
        
          
        
      
    );
  }

  const services = servicesData?.services || [];

  return (
    
      
        
          Service Catalog
          
            Define your organization's services and the problems they solve.
          
        
         setIsServiceDialogOpen(true)}>
          
          Add Service
        
      

      {services.length === 0 ? (
        
          
            
            No Services Yet
            
              Start by adding your organization's services to build your problem intelligence system.
            
             setIsServiceDialogOpen(true)}>
              
              Add Your First Service
            
          
        
      ) : (
        
          {services.map((service) => (
            
              
                
                  
                    
                      {service.serviceName}
                      
                        {SERVICE_CATEGORIES.find((c) => c.value === service.serviceCategory)?.label ||
                          service.serviceCategory}
                      
                    
                    {service.serviceDescription && (
                      {service.serviceDescription}
                    )}
                  
                  
                     handleEditService(service)}>
                      
                    
                     deleteServiceMutation.mutate(service.id)}
                    >
                      
                    
                  
                
              
              
                
                  
                    
                      
                        
                        
                          Problems Solved ({service.problemsSolved.length})
                        
                      
                    
                    
                      
                        {service.problemsSolved.length === 0 ? (
                          
                            No problems defined yet.
                          
                        ) : (
                          service.problemsSolved.map((problem) => (
                            
                              
                              
                                {problem.problemStatement}
                                
                                  {problem.severity}
                                
                              
                            
                          ))
                        )}
                         handleAddProblem(service.id)}
                        >
                          
                          Add Problem
                        
                      
                    
                  

                  
                    
                      
                        
                        
                          Differentiators ({service.differentiators.length})
                        
                      
                    
                    
                      
                        {service.differentiators.length === 0 ? (
                          
                            No differentiators defined yet.
                          
                        ) : (
                          service.differentiators.map((diff) => (
                            
                              {diff.claim}
                              Proof: {diff.proof}
                              {diff.competitorGap && (
                                
                                  Gap: {diff.competitorGap}
                                
                              )}
                            
                          ))
                        )}
                      
                    
                  
                

                {(service.targetIndustries?.length || service.targetPersonas?.length) && (
                  
                    {service.targetIndustries?.length && (
                      
                        Industries: 
                        {service.targetIndustries.join(", ")}
                      
                    )}
                    {service.targetPersonas?.length && (
                      
                        Personas: 
                        {service.targetPersonas.join(", ")}
                      
                    )}
                  
                )}
              
            
          ))}
        
      )}

      {/* Service Dialog */}
      
        
          
            {editingService ? "Edit Service" : "Add Service"}
            
              {editingService
                ? "Update the service details."
                : "Define a new service in your catalog."}
            
          
          
            
              Service Name *
               setServiceForm({ ...serviceForm, serviceName: e.target.value })}
                placeholder="Enterprise Platform"
              />
            
            
              Category
               setServiceForm({ ...serviceForm, serviceCategory: value })}
              >
                
                  
                
                
                  {SERVICE_CATEGORIES.map((cat) => (
                    
                      {cat.label}
                    
                  ))}
                
              
            
            
              Description
              
                  setServiceForm({ ...serviceForm, serviceDescription: e.target.value })
                }
                placeholder="Describe what this service does..."
                rows={3}
              />
            
            
              Target Industries
              
                  setServiceForm({ ...serviceForm, targetIndustries: e.target.value })
                }
                placeholder="SaaS, Healthcare, Finance (comma-separated)"
              />
            
            
              Target Personas
               setServiceForm({ ...serviceForm, targetPersonas: e.target.value })}
                placeholder="CTO, VP Engineering, IT Director (comma-separated)"
              />
            
          
          
             setIsServiceDialogOpen(false)}>
              Cancel
            
            
              {(createServiceMutation.isPending || updateServiceMutation.isPending) && (
                
              )}
              {editingService ? "Update" : "Create"}
            
          
        
      

      {/* Problem Dialog */}
      
        
          
            Add Problem
            
              Define a problem that this service helps solve.
            
          
          
            
              Problem Statement *
              
                  setProblemForm({ ...problemForm, problemStatement: e.target.value })
                }
                placeholder="Describe the problem your customers face..."
                rows={3}
              />
            
            
              Severity
               setProblemForm({ ...problemForm, severity: value })}
              >
                
                  
                
                
                  Low
                  Medium
                  High
                  Critical
                
              
            
          
          
             setIsProblemDialogOpen(false)}>
              Cancel
            
            
              {addProblemMutation.isPending && }
              Add Problem
            
          
        
      
    
  );
}