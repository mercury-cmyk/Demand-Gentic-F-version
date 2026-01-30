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

interface StepClientProjectProps {
  data: any;
  onNext: (data: any) => void;
}

export function StepClientProject({ data, onNext }: StepClientProjectProps) {
  const [selectedClientId, setSelectedClientId] = useState<string>(data?.clientAccountId || "");
  const [selectedProjectId, setSelectedProjectId] = useState<string>(data?.projectId || "");

  const { data: clients = [], isLoading: clientsLoading } = useQuery<ClientAccount[]>({
    queryKey: ["admin-client-accounts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/client-portal/admin/clients");
      if (!res.ok) throw new Error("Failed to load clients");
      return res.json();
    },
  });

  const { data: clientDetail, isLoading: projectsLoading } = useQuery<{ projects: ClientProject[] }>({
    queryKey: ["admin-client-projects", selectedClientId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/client-portal/admin/clients/${selectedClientId}`);
      if (!res.ok) throw new Error("Failed to load client projects");
      return res.json();
    },
    enabled: !!selectedClientId,
  });

  const projects = clientDetail?.projects || [];

  useEffect(() => {
    if (!selectedClientId) {
      setSelectedProjectId("");
      return;
    }

    if (selectedProjectId && projects.some((p) => p.id === selectedProjectId)) {
      return;
    }

    if (projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    } else {
      setSelectedProjectId("");
    }
  }, [selectedClientId, selectedProjectId, projects]);

  const handleNext = () => {
    if (!selectedClientId || !selectedProjectId) return;
    onNext({
      ...data,
      clientAccountId: selectedClientId,
      projectId: selectedProjectId,
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            Client Project
          </CardTitle>
          <CardDescription>Select the project this campaign belongs to.</CardDescription>
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

      <div className="flex justify-end">
        <Button onClick={handleNext} disabled={!selectedClientId || !selectedProjectId}>
          Next Step
        </Button>
      </div>
    </div>
  );
}

