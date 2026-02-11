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
}

interface StepClientProjectProps {
  data: any;
  onNext: (data: any) => void;
  initialClientId?: string;
  initialProjectId?: string;
}

export function StepClientProject({ data, onNext, initialClientId, initialProjectId }: StepClientProjectProps) {
  const [selectedClientId, setSelectedClientId] = useState<string>(data?.clientAccountId || initialClientId || "");
  const [selectedProjectId, setSelectedProjectId] = useState<string>(data?.projectId || initialProjectId || "");
  const [selectedWorkOrderId, setSelectedWorkOrderId] = useState<string>(data?.workOrderId || "");

  const { data: clients = [], isLoading: clientsLoading } = useQuery<ClientAccount[]>({
    queryKey: ["admin-client-accounts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/client-portal/admin/clients");
      if (!res.ok) throw new Error("Failed to load clients");
      return res.json();
    },
  });

  const { data: clientDetail, isLoading: projectsLoading } = useQuery<{ projects: ClientProject[], workOrders: WorkOrder[] }>({
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
    if (!selectedClientId || !selectedProjectId) return;
    onNext({
      ...data,
      clientAccountId: selectedClientId,
      projectId: selectedProjectId,
      workOrderId: selectedWorkOrderId || null, // Optional
    });
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight">Client & Project</h2>
        <p className="text-muted-foreground">
          Link this campaign to a specific client and project for governance and reporting.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Client Account
          </CardTitle>
          <CardDescription>Select the client who owns this campaign.</CardDescription>
        </CardHeader>
        <CardContent>
          {clientsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading clients...
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Client</Label>
              <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5" />
              Work Order (Optional)
            </CardTitle>
            <CardDescription>Link to an approved work order.</CardDescription>
          </CardHeader>
          <CardContent>
             {!selectedClientId ? (
              <p className="text-sm text-muted-foreground">Choose a client first.</p>
            ) : projectsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading orders...
              </div>
            ) : workOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">No work orders found.</p>
            ) : (
              <div className="space-y-2">
                <Label>Work Order</Label>
                <Select value={selectedWorkOrderId} onValueChange={setSelectedWorkOrderId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a work order" />
                  </SelectTrigger>
                  <SelectContent>
                    {workOrders.map((wo) => (
                      <SelectItem key={wo.id} value={wo.id}>
                        {wo.orderNumber} - {wo.title} ({wo.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FolderKanban className="h-5 w-5" />
              Client Project
            </CardTitle>
            <CardDescription>Select the project.</CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedClientId ? (
              <p className="text-sm text-muted-foreground">Choose a client to see available projects.</p>
            ) : projectsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading projects...
              </div>
            ) : projects.length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects found for this client.</p>
            ) : (
              <div className="space-y-2">
                <Label>Project</Label>
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name} ({project.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={handleNext} disabled={!selectedClientId || !selectedProjectId}>
          Next Step
        </Button>
      </div>
    </div>
  );
}

