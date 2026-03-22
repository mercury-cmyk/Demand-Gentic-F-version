import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/queryClient";
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
  metadata?: Record | null;
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
  const [environmentFilter, setEnvironmentFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [usageFilter, setUsageFilter] = useState("");
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedSecret, setSelectedSecret] = useState(null);
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
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || "Failed to load secrets");
      }
      return response.json() as Promise;
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
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || "Failed to create secret");
      }
      return response.json() as Promise;
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
        headers: getAuthHeaders(),
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || "Failed to load secret");
      }
      return response.json() as Promise;
    },
  });

  const rotateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/secrets/${id}/rotate`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value: rotateValue }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || "Failed to rotate secret");
      }
      return response.json() as Promise;
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

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/secrets/${id}/activate`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        credentials: "include",
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || "Failed to activate secret");
      }
      return response.json() as Promise;
    },
    onSuccess: (updated) => {
      toast({ title: "Secret activated" });
      setSelectedSecret((prev) =>
        updated && prev
          ? { ...updated, value: prev.value }
          : prev
      );
      queryClient.invalidateQueries({ queryKey: ["/api/secrets"] });
    },
    onError: (error: any) => {
      toast({
        title: "Unable to activate secret",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/secrets/${id}/deactivate`, {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: "Deactivated from dashboard" }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(error?.error || "Failed to deactivate secret");
      }
      return response.json() as Promise;
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
    
      
        
          
            
            Secret Manager
          
          Secret Vault
          
            Store credentials, keys, and service tokens securely within
            DemandGentic. Secrets stay encrypted in transit and at rest, and
            every rotation is audit logged.
          
        

        
          
            Runtime env: {runtimeEnvironment}
          
          
            
              
                New Secret
                
                  Provision a secret, scope it by environment/service/usage,
                  and it will be encrypted before reaching the database.
                
              
               {
                  event.preventDefault();
                  createMutation.mutate(createPayload);
                }}
              >
                
                  
                    Name
                  
                  
                      setCreatePayload((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    placeholder="Internal label (e.g. Mailgun API Key)"
                    required
                  />
                
                
                  
                    Description
                  
                  
                      setCreatePayload((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Optional context for operators"
                    rows={2}
                  />
                
                
                  
                    Environment
                  
                  
                      setCreatePayload((prev) => ({
                        ...prev,
                        environment: value as SecretEnvironment,
                      }))
                    }
                  >
                    
                      
                    
                    
                      {allowedEnvironments.map((env) => (
                        
                          {env}
                        
                      ))}
                    
                  
                
                
                  
                    Service / Integration
                  
                  
                      setCreatePayload((prev) => ({
                        ...prev,
                        service: e.target.value,
                      }))
                    }
                    placeholder="SMTP, Mailgun, Gemini API, etc."
                    required
                  />
                
                
                  
                    Usage Context
                  
                  
                      setCreatePayload((prev) => ({
                        ...prev,
                        usageContext: e.target.value,
                      }))
                    }
                    placeholder="Email notifications, AI agents, analytics"
                    required
                  />
                
                
                  
                    Value
                  
                  
                      setCreatePayload((prev) => ({
                        ...prev,
                        value: e.target.value,
                      }))
                    }
                    placeholder="Paste the secret value here"
                    rows={4}
                    required
                  />
                
                
                   setIsCreateModalOpen(false)}
                  >
                    Cancel
                  
                  
                    {createMutation.isLoading ? "Saving..." : "Create Secret"}
                  
                
              
            
          
           setIsCreateModalOpen(true)}
            className="flex items-center gap-2"
          >
            
            Create Secret
          
        
      

      
        
          
            Filters
            Scope the rows before drilling in
          
          
            
              
                Environment
              
               setEnvironmentFilter(value === "all" ? "" : value)}
              >
                
                  
                
                
                  All environments
                  {allowedEnvironments.map((env) => (
                    
                      {env}
                    
                  ))}
                
              
            
            
              
                Service
              
               setServiceFilter(e.target.value)}
              />
            
            
              
                Usage
              
               setUsageFilter(e.target.value)}
              />
            
             {
                setEnvironmentFilter("");
                setServiceFilter("");
                setUsageFilter("");
              }}
            >
              Reset filters
            
          
        

        
          
            Allowed environments
            
              Only these environments are visible from this deployment.
            
          
          
            {allowedEnvironments.map((env) => (
              
                {env}
              
            ))}
          
        
      

      
        
          Secrets
          
            Secrets update immediately and are encrypted before touching the
            database.
          
        
        
          {secretsQuery.isLoading ? (
            
              {[...Array(3)].map((_, index) => (
                
              ))}
            
          ) : secretsQuery.data?.secrets.length ? (
            
              
                
                  Name / Description
                  Environment
                  Service
                  Usage
                  Status
                  Version
                  Last rotated
                  Actions
                
              
              
                {secretsQuery.data.secrets.map((secret) => (
                  
                    
                      {secret.name}
                      
                        {secret.description ?? "No description"}
                      
                    
                    
                      {secret.environment}
                    
                    {secret.service}
                    {secret.usageContext}
                    
                      
                        {secret.isActive ? "Active" : "Inactive"}
                      
                    
                    {secret.version}
                    {formatDate(secret.lastRotatedAt)}
                    
                       handleViewSecret(secret.id)}
                      >
                        
                        View
                      
                    
                  
                ))}
              
            
          ) : (
            
              No secrets found. Create one to get started.
            
          )}
        
      

       {
          setIsDetailModalOpen(open);
          if (!open) {
            setSelectedSecret(null);
            setRotateValue("");
          }
        }}
      >
        
          
            Secret details
            
              Every fetch and rotation is gated by IAM and logged for audits.
            
          
          {selectedSecret ? (
            
              
                
                  Name
                
                {selectedSecret.name}
                
                  {selectedSecret.description ?? "No description provided"}
                
              
              
                
                  Environment: {selectedSecret.environment}
                
                
                  Service: {selectedSecret.service}
                
                
                  Usage: {selectedSecret.usageContext}
                
                
                  Status: {selectedSecret.isActive ? "Active" : "Inactive"}
                
              
              
                
                  Value
                  
                    
                    Copy
                  
                
                
              
              
                
                  Metadata
                
                
              
              
                
                  Rotate secret
                
                 setRotateValue(e.target.value)}
                  rows={3}
                  placeholder="Enter a new value to rotate now"
                />
                
                   rotateMutation.mutate(selectedSecret.id)}
                    disabled={!rotateValue.trim() || rotateMutation.isLoading}
                  >
                    
                    {rotateMutation.isLoading ? "Rotating..." : "Rotate"}
                  
                  {selectedSecret.isActive ? (
                     deactivateMutation.mutate(selectedSecret.id)}
                      disabled={deactivateMutation.isLoading}
                    >

                      {deactivateMutation.isLoading ? "Deactivating..." : "Deactivate"}

                  ) : (
                     activateMutation.mutate(selectedSecret.id)}
                      disabled={activateMutation.isLoading}
                    >

                      {activateMutation.isLoading ? "Activating..." : "Activate"}

                  )}
                
              
            
          ) : (
            Loading secret...
          )}
          
             setIsDetailModalOpen(false)}
            >
              Close
            
          
        
      
    
  );
}