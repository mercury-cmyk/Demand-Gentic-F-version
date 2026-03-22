import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Building2, FolderKanban } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ClientAccount {
  id: string;
  name: string;
}

interface ClientProject {
  id: string;
  name: string;
  status: string;
}

interface WorkOrder {
  id: string;
  orderNumber: string;
  title: string;
  status: string;
  projectId?: string;
  createdAt?: string;
}

interface StepClientProjectProps {
  data: any;
  onNext: (data: any) => void;
  initialClientId?: string;
  initialProjectId?: string;
}

export function canProceedFromClientProjectStep(
  selectedClientId: string,
  selectedProjectId: string,
  hasProjects: boolean,
): boolean {
  if (!selectedClientId) return false;
  if (hasProjects && !selectedProjectId) return false;
  return true;
}

export function StepClientProject({ data, onNext, initialClientId, initialProjectId }: StepClientProjectProps) {
  const [selectedClientId, setSelectedClientId] = useState(data?.clientAccountId || initialClientId || "");
  const [selectedProjectId, setSelectedProjectId] = useState(data?.projectId || initialProjectId || "");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState(data?.workOrderId || "");

  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["admin-client-accounts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/client-portal/admin/clients");
      if (!res.ok) throw new Error("Failed to load clients");
      return res.json();
    },
  });

  const { data: clientDetail, isLoading: projectsLoading } = useQuery({
    queryKey: ["admin-client-projects", selectedClientId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/client-portal/admin/clients/${selectedClientId}`);
      if (!res.ok) throw new Error("Failed to load client projects");
      return res.json();
    },
    enabled: !!selectedClientId,
  });

  const projects = clientDetail?.projects || [];
  const workOrders = clientDetail?.workOrders || [];
  const hasProjects = projects.length > 0;
  const hasWorkOrders = workOrders.length > 0;

  // Sync late-loaded edit data into local state when arriving from campaign edit.
  useEffect(() => {
    if (data?.clientAccountId && !selectedClientId) {
      setSelectedClientId(data.clientAccountId);
    }
    if (data?.projectId && !selectedProjectId) {
      setSelectedProjectId(data.projectId);
    }
    if (data?.workOrderId && !selectedWorkOrderId) {
      setSelectedWorkOrderId(data.workOrderId);
    }
  }, [data?.clientAccountId, data?.projectId, data?.workOrderId, selectedClientId, selectedProjectId, selectedWorkOrderId]);

  // When a work order is selected, try to auto-select its project if available
  useEffect(() => {
    if (selectedWorkOrderId) {
      const workOrder = workOrders.find(wo => wo.id === selectedWorkOrderId);
      if (workOrder?.projectId) {
        setSelectedProjectId(workOrder.projectId);
      }
    }
  }, [selectedWorkOrderId, workOrders]);

  useEffect(() => {
    if (!selectedClientId) {
      setSelectedProjectId("");
      setSelectedWorkOrderId("");
      return;
    }

    if (selectedProjectId && projects.some((p) => p.id === selectedProjectId)) {
      return;
    }

    if (projects.length > 0) {
      // Don't auto-select project if we might be selecting a work order that implies a project
      // But keeping legacy behavior if no work order selected
      if (!selectedWorkOrderId) {
         setSelectedProjectId(projects[0].id);
      }
    } else {
      setSelectedProjectId("");
    }
  }, [selectedClientId, selectedProjectId, projects, selectedWorkOrderId]);

  const handleNext = () => {
    if (!canProceedFromClientProjectStep(selectedClientId, selectedProjectId, hasProjects)) return;
    onNext({
      ...data,
      clientAccountId: selectedClientId,
      projectId: selectedProjectId || null,
      workOrderId: selectedWorkOrderId || null, // Optional
    });
  };

  return (
    
      
        Client & Project
        
          Link this campaign to a specific client and project for governance and reporting.
        
      

      
        
          
            
            Client Account
          
          Select the client who owns this campaign.
        
        
          {clientsLoading ? (
            
              
              Loading clients...
            
          ) : (
            
              Client
              
                
                  
                
                
                  {clients.map((client) => (
                    
                      {client.name}
                    
                  ))}
                
              
            
          )}
        
      

      
        
          
            
              
              Work Order (Optional)
            
            Link to an approved work order.
          
          
             {!selectedClientId ? (
              Choose a client first.
            ) : projectsLoading ? (
              
                
                Loading orders...
              
            ) : !hasWorkOrders ? (
              No approved work orders found for this client.
            ) : (
              
                Work Order
                
                  
                    
                  
                  
                    {workOrders.map((wo) => (
                      
                        {wo.orderNumber} - {wo.title} ({wo.status})
                      
                    ))}
                  
                
              
            )}
          
        

        
          
            
              
              Client Project
            
            Select the project.
          
          
            {!selectedClientId ? (
              Choose a client to see available projects.
            ) : projectsLoading ? (
              
                
                Loading projects...
              
            ) : !hasProjects ? (
              No client projects found for this client.
            ) : (
              
                Project
                
                  
                    
                  
                  
                    {projects.map((project) => (
                      
                        {project.name} ({project.status})
                      
                    ))}
                  
                
              
            )}
          
        
      

      
        
          Next Step
        
      
    
  );
}