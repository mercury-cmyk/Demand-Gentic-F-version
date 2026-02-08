import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shield,
  Key,
  Eye,
  RotateCcw,
  Slash,
  ClipboardCopy,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

type SecretEnvironment = "development" | "production";

interface SecretSummary {
  id: string;
  name: string;
  description?: string | null;
  environment: SecretEnvironment;
  service: string;
  usageContext: string;
  metadata?: Record<string, unknown> | null;
  version: number;
  isActive: boolean;
  lastRotatedAt?: string | null;
  deactivatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SecretDetail extends SecretSummary {
  value: unknown;
}

interface SecretsListResponse {
  secrets: SecretSummary[];
  allowedEnvironments: SecretEnvironment[];
  runtimeEnvironment: SecretEnvironment;
}

const formatDate = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "—";

const formatSecretValue = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  if (value == null) {
    return "";
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export default function IamSecrets() {
  const queryClient = useQueryClient();
  const [environmentFilter, setEnvironmentFilter] = useState<string>("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [usageFilter, setUsageFilter] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedSecret, setSelectedSecret] = useState<SecretDetail | null>(null);
  const [rotateValue, setRotateValue] = useState("");
  const [createPayload, setCreatePayload] = useState({
    name: "",
    description: "",
    environment: "development" as SecretEnvironment,
    service: "",
    usageContext: "",
    value: "",
  });

  const filterParams = useMemo(
    () => ({
      environment: environmentFilter || undefined,
      service: serviceFilter.trim() || undefined,
      usageContext: usageFilter.trim() || undefined,
    }),
    [environmentFilter, serviceFilter, usageFilter]
  );

  const secretsQuery = useQuery({
    queryKey: ["/api/secrets", filterParams],
    queryFn: async ({ queryKey }) => {
      const [, filters] = queryKey as [string, typeof filterParams];
      const params = new URLSearchParams();
      if (filters.environment) params.set("environment", filters.environment);
      if (filters.service) params.set("service", filters.service);
      if (filters.usageContext) params.set("usageContext", filters.usageContext);
      const response = await fetch(`/api/secrets?${params.toString()}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || "Failed to load secrets");
      }
      return response.json() as Promise<SecretsListResponse>;
    },
    keepPreviousData: true,
  });

  const allowedEnvironments = secretsQuery.data?.allowedEnvironments ?? ["development"];
  const runtimeEnvironment = secretsQuery.data?.runtimeEnvironment ?? "development";

  useEffect(() => {
    if (
      createPayload.environment &&
      !allowedEnvironments.includes(createPayload.environment)
    ) {
      setCreatePayload((prev) => ({
        ...prev,
        environment: allowedEnvironments[0] ?? "development",
      }));
    }

    if (
      environmentFilter &&
      !allowedEnvironments.includes(environmentFilter as SecretEnvironment)
    ) {
      setEnvironmentFilter("");
    }
  }, [allowedEnvironments, environmentFilter, createPayload.environment]);

  const createMutation = useMutation({
    mutationFn: async (payload: typeof createPayload) => {
      const response = await fetch("/api/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || "Failed to create secret");
      }
      return response.json() as Promise<SecretDetail>;
    },
    onSuccess: () => {
      toast({ title: "Secret created" });
      setIsCreateModalOpen(false);
      setCreatePayload((prev) => ({
        ...prev,
        name: "",
        description: "",
        service: "",
        usageContext: "",
        value: "",
      }));
      queryClient.invalidateQueries({ queryKey: ["/api/secrets"] });
    },
    onError: (error: any) => {
      toast({
        title: "Unable to create secret",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const detailMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/secrets/${id}`, {
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || "Failed to load secret");
      }
      return response.json() as Promise<SecretDetail>;
    },
  });

  const rotateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/secrets/${id}/rotate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value: rotateValue }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || "Failed to rotate secret");
      }
      return response.json() as Promise<SecretSummary>;
    },
    onSuccess: (updated) => {
      toast({ title: "Secret rotated" });
      setSelectedSecret((prev) =>
        updated && prev
          ? { ...updated, value: rotateValue }
          : prev
      );
      queryClient.invalidateQueries({ queryKey: ["/api/secrets"] });
    },
    onError: (error: any) => {
      toast({
        title: "Unable to rotate secret",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/secrets/${id}/deactivate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: "Deactivated from dashboard" }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || "Failed to deactivate secret");
      }
      return response.json() as Promise<SecretSummary>;
    },
    onSuccess: (updated) => {
      toast({ title: "Secret deactivated" });
      setSelectedSecret((prev) =>
        updated && prev
          ? { ...updated, value: prev.value }
          : prev
      );
      queryClient.invalidateQueries({ queryKey: ["/api/secrets"] });
    },
    onError: (error: any) => {
      toast({
        title: "Unable to deactivate secret",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleViewSecret = async (secretId: string) => {
    try {
      const detail = await detailMutation.mutateAsync(secretId);
      setSelectedSecret(detail);
      setRotateValue(formatSecretValue(detail.value));
      setIsDetailModalOpen(true);
    } catch (error: any) {
      toast({
        title: "Unable to load secret",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleCopyValue = () => {
    if (!selectedSecret) return;
    const value = formatSecretValue(selectedSecret.value);
    navigator.clipboard.writeText(value).then(() => {
      toast({ title: "Secret copied" });
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Shield className="h-4 w-4" />
            <span>Secret Manager</span>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Secret Vault</h1>
          <p className="text-muted-foreground max-w-2xl">
            Store credentials, keys, and service tokens securely within
            DemandGentic. Secrets stay encrypted in transit and at rest, and
            every rotation is audit logged.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            Runtime env: {runtimeEnvironment}
          </Badge>
          <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>New Secret</DialogTitle>
                <DialogDescription>
                  Provision a secret, scope it by environment/service/usage,
                  and it will be encrypted before reaching the database.
                </DialogDescription>
              </DialogHeader>
              <form
                className="space-y-4 mt-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  createMutation.mutate(createPayload);
                }}
              >
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Name
                  </label>
                  <Input
                    value={createPayload.name}
                    onChange={(e) =>
                      setCreatePayload((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    placeholder="Internal label (e.g. Mailgun API Key)"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Description
                  </label>
                  <Textarea
                    value={createPayload.description}
                    onChange={(e) =>
                      setCreatePayload((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Optional context for operators"
                    rows={2}
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Environment
                  </label>
                  <Select
                    value={createPayload.environment}
                    onValueChange={(value) =>
                      setCreatePayload((prev) => ({
                        ...prev,
                        environment: value as SecretEnvironment,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select environment" />
                    </SelectTrigger>
                    <SelectContent>
                      {allowedEnvironments.map((env) => (
                        <SelectItem key={env} value={env}>
                          {env}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Service / Integration
                  </label>
                  <Input
                    value={createPayload.service}
                    onChange={(e) =>
                      setCreatePayload((prev) => ({
                        ...prev,
                        service: e.target.value,
                      }))
                    }
                    placeholder="SMTP, Mailgun, Gemini API, etc."
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Usage Context
                  </label>
                  <Input
                    value={createPayload.usageContext}
                    onChange={(e) =>
                      setCreatePayload((prev) => ({
                        ...prev,
                        usageContext: e.target.value,
                      }))
                    }
                    placeholder="Email notifications, AI agents, analytics"
                    required
                  />
                </div>
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Value
                  </label>
                  <Textarea
                    value={createPayload.value}
                    onChange={(e) =>
                      setCreatePayload((prev) => ({
                        ...prev,
                        value: e.target.value,
                      }))
                    }
                    placeholder="Paste the secret value here"
                    rows={4}
                    required
                  />
                </div>
                <DialogFooter className="space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateModalOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createMutation.isLoading}>
                    {createMutation.isLoading ? "Saving..." : "Create Secret"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Button
            variant="secondary"
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Create Secret
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
            <CardDescription>Scope the rows before drilling in</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Environment
              </label>
              <Select
                value={environmentFilter || "all"}
                onValueChange={(value) => setEnvironmentFilter(value === "all" ? "" : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All environments" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All environments</SelectItem>
                  {allowedEnvironments.map((env) => (
                    <SelectItem key={env} value={env}>
                      {env}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Service
              </label>
              <Input
                placeholder="e.g. Mailgun"
                value={serviceFilter}
                onChange={(e) => setServiceFilter(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Usage
              </label>
              <Input
                placeholder="e.g. notifications"
                value={usageFilter}
                onChange={(e) => setUsageFilter(e.target.value)}
              />
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                setEnvironmentFilter("");
                setServiceFilter("");
                setUsageFilter("");
              }}
            >
              Reset filters
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Allowed environments</CardTitle>
            <CardDescription>
              Only these environments are visible from this deployment.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {allowedEnvironments.map((env) => (
              <Badge
                key={env}
                variant={runtimeEnvironment === env ? "default" : "outline"}
              >
                {env}
              </Badge>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Secrets</CardTitle>
          <CardDescription>
            Secrets update immediately and are encrypted before touching the
            database.
          </CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {secretsQuery.isLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : secretsQuery.data?.secrets.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name / Description</TableHead>
                  <TableHead>Environment</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Usage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Last rotated</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {secretsQuery.data.secrets.map((secret) => (
                  <TableRow key={secret.id}>
                    <TableCell>
                      <div className="font-medium">{secret.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {secret.description ?? "No description"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{secret.environment}</Badge>
                    </TableCell>
                    <TableCell>{secret.service}</TableCell>
                    <TableCell>{secret.usageContext}</TableCell>
                    <TableCell>
                      <Badge variant={secret.isActive ? "default" : "destructive"}>
                        {secret.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>{secret.version}</TableCell>
                    <TableCell>{formatDate(secret.lastRotatedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleViewSecret(secret.id)}
                      >
                        <Eye className="mr-1 h-4 w-4" />
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">
              No secrets found. Create one to get started.
            </p>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isDetailModalOpen}
        onOpenChange={(open) => {
          setIsDetailModalOpen(open);
          if (!open) {
            setSelectedSecret(null);
            setRotateValue("");
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Secret details</DialogTitle>
            <DialogDescription>
              Every fetch and rotation is gated by IAM and logged for audits.
            </DialogDescription>
          </DialogHeader>
          {selectedSecret ? (
            <div className="space-y-4">
              <div className="grid gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Name
                </span>
                <div className="text-lg font-semibold">{selectedSecret.name}</div>
                <div className="text-sm text-muted-foreground">
                  {selectedSecret.description ?? "No description provided"}
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="outline">
                  Environment: {selectedSecret.environment}
                </Badge>
                <Badge variant="outline">
                  Service: {selectedSecret.service}
                </Badge>
                <Badge variant="outline">
                  Usage: {selectedSecret.usageContext}
                </Badge>
                <Badge variant="outline">
                  Status: {selectedSecret.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Value</span>
                  <Button
                    variant="ghost"
                    className="text-xs"
                    onClick={handleCopyValue}
                  >
                    <ClipboardCopy className="mr-1 h-4 w-4" />
                    Copy
                  </Button>
                </div>
                <Textarea
                  value={formatSecretValue(selectedSecret.value)}
                  readOnly
                  rows={4}
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Metadata</span>
                </div>
                <Textarea
                  value={
                    selectedSecret.metadata
                      ? JSON.stringify(selectedSecret.metadata, null, 2)
                      : "—"
                  }
                  readOnly
                  rows={3}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Rotate secret
                </label>
                <Textarea
                  value={rotateValue}
                  onChange={(e) => setRotateValue(e.target.value)}
                  rows={3}
                  placeholder="Enter a new value to rotate now"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => rotateMutation.mutate(selectedSecret.id)}
                    disabled={!rotateValue.trim() || rotateMutation.isLoading}
                  >
                    <RotateCcw className="mr-1 h-4 w-4" />
                    {rotateMutation.isLoading ? "Rotating..." : "Rotate"}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => deactivateMutation.mutate(selectedSecret.id)}
                    disabled={deactivateMutation.isLoading || !selectedSecret.isActive}
                  >
                    <Slash className="mr-1 h-4 w-4" />
                    {selectedSecret.isActive ? "Deactivate" : "Deactivate again"}
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading secret...</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDetailModalOpen(false)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
