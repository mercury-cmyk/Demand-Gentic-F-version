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
    providerLabels: Record;
    modelSuggestions: Record>>;
  };
  health: {
    providers: Record;
    scopes: Record;
  };
}

interface HistoryResponse {
  history: Array;
}

function clonePolicies(policies: AiModelPolicyMap): AiModelPolicyMap {
  return JSON.parse(JSON.stringify(policies)) as AiModelPolicyMap;
}

export default function AiGovernanceSettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [draftPolicies, setDraftPolicies] = useState(null);
  const [changeSummary, setChangeSummary] = useState("");

  if (authLoading) {
    return (
      
        
          
        
      
    );
  }

  const allowed = user && ["admin", "campaign_manager"].includes(user.role);
  if (!allowed) {
    return ;
  }

  const governanceQuery = useQuery({
    queryKey: ["/api/ai-governance"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/ai-governance");
      return res.json();
    },
  });

  const historyQuery = useQuery({
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

  const updatePolicy = (
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
      
        
          
        
      
    );
  }

  const { catalog, config, health } = governanceQuery.data!;

  return (
    
      
        
          
            
              
                
                  
                  Runtime Model Control
                
                
                  These policies govern live routing for voice and the shared analysis router. Changes are audited.
                
              
              
                
                  {config.isSystemDefault ? "System defaults" : `Version ${config.version}`}
                
                {config.updatedAt ? (
                  
                    Updated {new Date(config.updatedAt).toLocaleString()}
                  
                ) : null}
              
            
          
          
            
              {(Object.keys(health.providers) as AiGovernanceProvider[]).map((provider) => (
                
                  
                    {catalog.providerLabels[provider] || AI_PROVIDER_LABELS[provider]}
                    
                      {health.providers[provider].available ? "Ready" : "Missing"}
                    
                  
                  {health.providers[provider].reason ? (
                    {health.providers[provider].reason}
                  ) : (
                    Credentials look available.
                  )}
                
              ))}
            

            
              Change summary
               setChangeSummary(event.target.value)}
                placeholder="Why are you changing model governance?"
              />
            

            
               saveMutation.mutate()} disabled={!isDirty || saveMutation.isPending}>
                {saveMutation.isPending ? (
                  
                ) : (
                  
                )}
                Save governance
              
               setDraftPolicies(clonePolicies(config.policies))}
              >
                
                Revert changes
              
               setDraftPolicies(cloneDefaultAiModelPolicies())}
              >
                
                Load recommended defaults
              
            
          
        

        
          {catalog.tasks.map((task) => {
            const policy = draftPolicies[task.key];
            const scopeHealth = health.scopes[task.key];
            const primarySuggestions = catalog.modelSuggestions[task.key]?.[policy.primaryProvider] || [];
            const fallbackSuggestions = policy.fallbackProvider
              ? (catalog.modelSuggestions[task.key]?.[policy.fallbackProvider] || [])
              : [];

            return (
              
                
                  
                    
                      {task.label}
                      {task.description}
                    
                    
                      
                        {policy.enabled ? "Enabled" : "Disabled"}
                      
                      
                        {scopeHealth.primaryAvailable ? "Primary ready" : "Primary blocked"}
                      
                    
                  
                
                
                  {scopeHealth.warnings.length > 0 ? (
                    
                      
                        
                        Safety warnings
                      
                      
                        {scopeHealth.warnings.map((warning) => (
                          {warning}
                        ))}
                      
                    
                  ) : null}

                  
                    
                      Govern this task
                      
                        Disable this only if you want the task reserved but not actively enforced.
                      
                    
                     updatePolicy(task.key, "enabled", checked)}
                    />
                  

                  
                    
                      Primary provider
                       updatePolicy(task.key, "primaryProvider", value as AiGovernanceProvider)}
                      >
                        
                          
                        
                        
                          {task.allowedProviders.map((provider) => (
                            
                              {catalog.providerLabels[provider] || AI_PROVIDER_LABELS[provider]}
                            
                          ))}
                        
                      
                    
                    
                      Primary model
                       updatePolicy(task.key, "primaryModel", event.target.value)}
                        placeholder="Enter a model name"
                      />
                    
                  

                  {primarySuggestions.length > 0 ? (
                    
                      {primarySuggestions.map((model) => (
                         applySuggestedModel(task.key, policy.primaryProvider, model, "primaryModel")}
                        >
                          {model}
                        
                      ))}
                    
                  ) : null}

                  
                    
                      Fallback provider
                      
                        Use a second provider/model if the primary is unavailable or intentionally rolled over.
                      
                    
                     {
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
                  

                  {policy.allowFallback ? (
                    <>
                      
                        
                          Fallback provider
                           updatePolicy(task.key, "fallbackProvider", value as AiGovernanceProvider)}
                          >
                            
                              
                            
                            
                              {task.allowedProviders.map((provider) => (
                                
                                  {catalog.providerLabels[provider] || AI_PROVIDER_LABELS[provider]}
                                
                              ))}
                            
                          
                        
                        
                          Fallback model
                           updatePolicy(task.key, "fallbackModel", event.target.value || null)}
                            placeholder="Enter fallback model"
                          />
                        
                      

                      {fallbackSuggestions.length > 0 ? (
                        
                          {fallbackSuggestions.map((model) => (
                             applySuggestedModel(task.key, policy.fallbackProvider || policy.primaryProvider, model, "fallbackModel")}
                            >
                              {model}
                            
                          ))}
                        
                      ) : null}
                    
                  ) : null}

                  
                    Operational note
                     updatePolicy(task.key, "notes", event.target.value || null)}
                      placeholder="Document why this policy exists or when it should be changed."
                    />
                  
                
              
            );
          })}
        

        
          
            
              
              Recent Changes
            
            Latest audited governance updates.
          
          
            {historyQuery.isLoading ? (
              
                
              
            ) : historyQuery.data?.history.length ? (
              historyQuery.data.history.slice(0, 8).map((entry) => (
                
                  
                    {entry.changesJson?.changeSummary || "Governance updated"}
                    
                      {new Date(entry.createdAt).toLocaleString()}
                    
                  
                  
                    Action: {entry.action}
                  
                
              ))
            ) : (
              
                No governance changes have been recorded yet.
              
            )}
          
        
      
    
  );
}