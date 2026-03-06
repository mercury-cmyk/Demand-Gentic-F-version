import { useEffect, useMemo, useState } from "react";
import { Redirect } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  Bot,
  History,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";

import type {
  AiGovernancePolicy,
  AiGovernanceProvider,
  AiGovernanceScope,
  AiModelPolicyMap,
} from "@shared/ai-governance";
import { cloneDefaultAiModelPolicies, AI_PROVIDER_LABELS } from "@shared/ai-governance";

import { SettingsLayout } from "@/components/settings/settings-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";

interface GovernanceTaskMeta {
  key: AiGovernanceScope;
  label: string;
  description: string;
  allowedProviders: AiGovernanceProvider[];
}

interface ProviderAvailability {
  available: boolean;
  reason: string | null;
}

interface ScopeHealth {
  primaryAvailable: boolean;
  fallbackAvailable: boolean | null;
  warnings: string[];
}

interface GovernanceResponse {
  config: {
    id: string | null;
    version: number;
    policies: AiModelPolicyMap;
    updatedAt: string | null;
    updatedBy: string | null;
    isSystemDefault: boolean;
  };
  catalog: {
    tasks: GovernanceTaskMeta[];
    providerLabels: Record<AiGovernanceProvider, string>;
    modelSuggestions: Record<AiGovernanceScope, Partial<Record<AiGovernanceProvider, string[]>>>;
  };
  health: {
    providers: Record<AiGovernanceProvider, ProviderAvailability>;
    scopes: Record<AiGovernanceScope, ScopeHealth>;
  };
}

interface HistoryResponse {
  history: Array<{
    id: string;
    action: string;
    changesJson?: {
      changeSummary?: string | null;
    } | null;
    createdAt: string;
    userId: string | null;
  }>;
}

function clonePolicies(policies: AiModelPolicyMap): AiModelPolicyMap {
  return JSON.parse(JSON.stringify(policies)) as AiModelPolicyMap;
}

export default function AiGovernanceSettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draftPolicies, setDraftPolicies] = useState<AiModelPolicyMap | null>(null);
  const [changeSummary, setChangeSummary] = useState("");

  if (authLoading) {
    return (
      <SettingsLayout
        title="AI Governance"
        description="Control which AI models are used for voice, analysis, and other governed tasks."
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </SettingsLayout>
    );
  }

  const allowed = user && ["admin", "campaign_manager"].includes(user.role);
  if (!allowed) {
    return <Redirect to="/" />;
  }

  const governanceQuery = useQuery<GovernanceResponse>({
    queryKey: ["/api/ai-governance"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/ai-governance");
      return res.json();
    },
  });

  const historyQuery = useQuery<HistoryResponse>({
    queryKey: ["/api/ai-governance/history"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/ai-governance/history");
      return res.json();
    },
  });

  useEffect(() => {
    if (governanceQuery.data?.config.policies) {
      setDraftPolicies(clonePolicies(governanceQuery.data.config.policies));
    }
  }, [governanceQuery.data]);

  const isDirty = useMemo(() => {
    if (!draftPolicies || !governanceQuery.data?.config.policies) return false;
    return JSON.stringify(draftPolicies) !== JSON.stringify(governanceQuery.data.config.policies);
  }, [draftPolicies, governanceQuery.data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draftPolicies) {
        throw new Error("No governance changes to save");
      }
      const res = await apiRequest("PUT", "/api/ai-governance", {
        policies: draftPolicies,
        changeSummary: changeSummary.trim() || null,
      });
      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        throw new Error(errorBody.message || "Failed to save AI governance");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-governance"] });
      queryClient.invalidateQueries({ queryKey: ["/api/ai-governance/history"] });
      setChangeSummary("");
      toast({
        title: "AI governance updated",
        description: "Runtime model policies have been saved and audited.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Save failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const updatePolicy = <K extends keyof AiGovernancePolicy>(
    scope: AiGovernanceScope,
    field: K,
    value: AiGovernancePolicy[K],
  ) => {
    setDraftPolicies((current) => {
      if (!current) return current;
      return {
        ...current,
        [scope]: {
          ...current[scope],
          [field]: value,
        },
      };
    });
  };

  const applySuggestedModel = (
    scope: AiGovernanceScope,
    provider: AiGovernanceProvider,
    model: string,
    target: "primaryModel" | "fallbackModel",
  ) => {
    updatePolicy(scope, target, model as AiGovernancePolicy[typeof target]);
    if (target === "primaryModel") {
      updatePolicy(scope, "primaryProvider", provider);
    } else {
      updatePolicy(scope, "fallbackProvider", provider);
    }
  };

  if (governanceQuery.isLoading || !draftPolicies) {
    return (
      <SettingsLayout
        title="AI Governance"
        description="Control which AI models are used for voice, analysis, and other governed tasks."
      >
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </SettingsLayout>
    );
  }

  const { catalog, config, health } = governanceQuery.data!;

  return (
    <SettingsLayout
      title="AI Governance"
      description="Centralize task-to-model routing with safe defaults, explicit fallbacks, and audit visibility."
    >
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5" />
                  Runtime Model Control
                </CardTitle>
                <CardDescription>
                  These policies govern live routing for voice and the shared analysis router. Changes are audited.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={config.isSystemDefault ? "outline" : "secondary"}>
                  {config.isSystemDefault ? "System defaults" : `Version ${config.version}`}
                </Badge>
                {config.updatedAt ? (
                  <Badge variant="outline">
                    Updated {new Date(config.updatedAt).toLocaleString()}
                  </Badge>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-5">
              {(Object.keys(health.providers) as AiGovernanceProvider[]).map((provider) => (
                <div key={provider} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{catalog.providerLabels[provider] || AI_PROVIDER_LABELS[provider]}</span>
                    <Badge variant={health.providers[provider].available ? "default" : "destructive"}>
                      {health.providers[provider].available ? "Ready" : "Missing"}
                    </Badge>
                  </div>
                  {health.providers[provider].reason ? (
                    <p className="mt-2 text-xs text-muted-foreground">{health.providers[provider].reason}</p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">Credentials look available.</p>
                  )}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <Label htmlFor="change-summary">Change summary</Label>
              <Input
                id="change-summary"
                value={changeSummary}
                onChange={(event) => setChangeSummary(event.target.value)}
                placeholder="Why are you changing model governance?"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => saveMutation.mutate()} disabled={!isDirty || saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save governance
              </Button>
              <Button
                variant="outline"
                disabled={!isDirty}
                onClick={() => setDraftPolicies(clonePolicies(config.policies))}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Revert changes
              </Button>
              <Button
                variant="outline"
                onClick={() => setDraftPolicies(cloneDefaultAiModelPolicies())}
              >
                <Bot className="mr-2 h-4 w-4" />
                Load recommended defaults
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {catalog.tasks.map((task) => {
            const policy = draftPolicies[task.key];
            const scopeHealth = health.scopes[task.key];
            const primarySuggestions = catalog.modelSuggestions[task.key]?.[policy.primaryProvider] || [];
            const fallbackSuggestions = policy.fallbackProvider
              ? (catalog.modelSuggestions[task.key]?.[policy.fallbackProvider] || [])
              : [];

            return (
              <Card key={task.key}>
                <CardHeader>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <CardTitle className="text-base">{task.label}</CardTitle>
                      <CardDescription>{task.description}</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={policy.enabled ? "default" : "secondary"}>
                        {policy.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      <Badge variant={scopeHealth.primaryAvailable ? "outline" : "destructive"}>
                        {scopeHealth.primaryAvailable ? "Primary ready" : "Primary blocked"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {scopeHealth.warnings.length > 0 ? (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                      <div className="mb-2 flex items-center gap-2 font-medium">
                        <AlertCircle className="h-4 w-4" />
                        Safety warnings
                      </div>
                      <div className="space-y-1">
                        {scopeHealth.warnings.map((warning) => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">Govern this task</p>
                      <p className="text-xs text-muted-foreground">
                        Disable this only if you want the task reserved but not actively enforced.
                      </p>
                    </div>
                    <Switch
                      checked={policy.enabled}
                      onCheckedChange={(checked) => updatePolicy(task.key, "enabled", checked)}
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Primary provider</Label>
                      <Select
                        value={policy.primaryProvider}
                        onValueChange={(value) => updatePolicy(task.key, "primaryProvider", value as AiGovernanceProvider)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {task.allowedProviders.map((provider) => (
                            <SelectItem key={provider} value={provider}>
                              {catalog.providerLabels[provider] || AI_PROVIDER_LABELS[provider]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Primary model</Label>
                      <Input
                        value={policy.primaryModel}
                        onChange={(event) => updatePolicy(task.key, "primaryModel", event.target.value)}
                        placeholder="Enter a model name"
                      />
                    </div>
                  </div>

                  {primarySuggestions.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {primarySuggestions.map((model) => (
                        <Button
                          key={model}
                          type="button"
                          size="sm"
                          variant={policy.primaryModel === model ? "default" : "outline"}
                          onClick={() => applySuggestedModel(task.key, policy.primaryProvider, model, "primaryModel")}
                        >
                          {model}
                        </Button>
                      ))}
                    </div>
                  ) : null}

                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <p className="text-sm font-medium">Fallback provider</p>
                      <p className="text-xs text-muted-foreground">
                        Use a second provider/model if the primary is unavailable or intentionally rolled over.
                      </p>
                    </div>
                    <Switch
                      checked={policy.allowFallback}
                      onCheckedChange={(checked) => {
                        updatePolicy(task.key, "allowFallback", checked);
                        if (!checked) {
                          updatePolicy(task.key, "fallbackProvider", null);
                          updatePolicy(task.key, "fallbackModel", null);
                        } else {
                          const fallbackProvider = task.allowedProviders.find((provider) => provider !== policy.primaryProvider) || task.allowedProviders[0];
                          const fallbackModel = catalog.modelSuggestions[task.key]?.[fallbackProvider]?.[0] || "";
                          updatePolicy(task.key, "fallbackProvider", fallbackProvider);
                          updatePolicy(task.key, "fallbackModel", fallbackModel || null);
                        }
                      }}
                    />
                  </div>

                  {policy.allowFallback ? (
                    <>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Fallback provider</Label>
                          <Select
                            value={policy.fallbackProvider || undefined}
                            onValueChange={(value) => updatePolicy(task.key, "fallbackProvider", value as AiGovernanceProvider)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select fallback provider" />
                            </SelectTrigger>
                            <SelectContent>
                              {task.allowedProviders.map((provider) => (
                                <SelectItem key={provider} value={provider}>
                                  {catalog.providerLabels[provider] || AI_PROVIDER_LABELS[provider]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Fallback model</Label>
                          <Input
                            value={policy.fallbackModel || ""}
                            onChange={(event) => updatePolicy(task.key, "fallbackModel", event.target.value || null)}
                            placeholder="Enter fallback model"
                          />
                        </div>
                      </div>

                      {fallbackSuggestions.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {fallbackSuggestions.map((model) => (
                            <Button
                              key={model}
                              type="button"
                              size="sm"
                              variant={policy.fallbackModel === model ? "default" : "outline"}
                              onClick={() => applySuggestedModel(task.key, policy.fallbackProvider || policy.primaryProvider, model, "fallbackModel")}
                            >
                              {model}
                            </Button>
                          ))}
                        </div>
                      ) : null}
                    </>
                  ) : null}

                  <div className="space-y-2">
                    <Label>Operational note</Label>
                    <Textarea
                      rows={2}
                      value={policy.notes || ""}
                      onChange={(event) => updatePolicy(task.key, "notes", event.target.value || null)}
                      placeholder="Document why this policy exists or when it should be changed."
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4" />
              Recent Changes
            </CardTitle>
            <CardDescription>Latest audited governance updates.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {historyQuery.isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : historyQuery.data?.history.length ? (
              historyQuery.data.history.slice(0, 8).map((entry) => (
                <div key={entry.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{entry.changesJson?.changeSummary || "Governance updated"}</p>
                    <span className="text-xs text-muted-foreground">
                      {new Date(entry.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Action: {entry.action}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                No governance changes have been recorded yet.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </SettingsLayout>
  );
}
