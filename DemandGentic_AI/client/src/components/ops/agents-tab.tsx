import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Activity,
  Bot,
  CheckCircle2,
  Clock,
  DollarSign,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { apiJsonRequest } from '@/lib/queryClient';

interface ProviderInfo {
  name: string;
  label?: string;
  available: boolean;
  avgLatencyMs: number;
  successRate: string;
  costPerRequest: string;
  defaultModel?: string;
  activeRuntimeAccess?: string;
  runtimeAccessModes?: string[];
  notes?: string[];
}

interface ProviderBreakdown {
  count: number;
  cost: number;
  avgLatency: number;
}

interface OrchestratorStatus {
  totalRequests: number;
  totalCost: string;
  avgLatency: string;
  breakdown: Record;
}

interface WorkflowStep {
  role: string;
  roleLabel: string;
  purpose: string;
  provider: string;
  label: string;
  available: boolean;
  defaultModel: string;
}

const PROVIDER_COLORS: Record = {
  codex: 'bg-violet-500',
  claude: 'bg-orange-500',
  gemini: 'bg-blue-500',
  kimi: 'bg-emerald-500',
  deepseek: 'bg-rose-500',
  ensemble: 'bg-slate-900',
};

const PROVIDER_LABELS: Record = {
  codex: 'Codex',
  claude: 'Claude (Anthropic)',
  gemini: 'Gemini (Google)',
  kimi: 'Kimi (Moonshot)',
  deepseek: 'DeepSeek',
};

export default function AgentsTab() {
  const [status, setStatus] = useState(null);
  const [providers, setProviders] = useState([]);
  const [workflow, setWorkflow] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiJsonRequest('GET', '/api/ops/agents/status');
      setStatus(data.status);
      setProviders(data.providers || []);
      setWorkflow(data.workflow || []);
    } catch (err) {
      console.error('Failed to fetch agent status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  const availableCount = providers.filter((provider) => provider.available).length;

  return (
    
      
        
          
            
              
                Providers
                {availableCount}/{providers.length}
              
              
                
              
            
          
        

        
          
            
              
                Requests
                {status?.totalRequests ?? 0}
              
              
                
              
            
          
        

        
          
            
              
                Avg Latency
                {status?.avgLatency ?? '--'}ms
              
              
                
              
            
          
        

        
          
            
              
                Total Cost
                ${status?.totalCost ?? '0.0000'}
              
              
                
              
            
          
        
      

      
        
          
            Collaborative Coding Orchestrator
            AgentX Ensemble
            
              Ops Hub now routes coding work through a staged ensemble: Kimi for architecture, Claude for reasoning, DeepSeek for security and cost, Gemini for UX and performance, and Codex for final synthesis.
            
          
          
            
              Execution
              Staged multi-agent review
            
            
              Fallback
              Single-provider recovery path
            
          
        
      

      {workflow.length > 0 && (
        
          
            Collaborative Workflow
            
              Default role assignments used when AgentX runs collaborative coding mode.
            
          
          
            
              {workflow.map((step) => (
                
                  
                    
                      
                        {step.roleLabel}
                      
                      {step.label}
                    
                    
                  
                  {step.purpose}
                  
                    Default model: {step.defaultModel}
                    {step.available ? 'Configured' : 'Waiting for credentials'}
                  
                
              ))}
            
          
        
      )}

      
        
          
            Collaborative Providers
            
              Each provider has a distinct role in collaborative coding mode, and can also serve as a routed fallback when another stage is unavailable.
            
          
          
            
            Refresh
          
        
        
          {loading ? (
            
              
            
          ) : (
            
              {providers.map((provider) => (
                
                  
                    
                      
                      
                        {provider.label || PROVIDER_LABELS[provider.name] || provider.name}
                      
                    
                    {provider.available ? (
                      
                        
                        Online
                      
                    ) : (
                      
                        
                        Offline
                      
                    )}
                  

                  
                    
                      Success Rate
                      {provider.successRate}
                    
                    
                      Avg Latency
                      {provider.avgLatencyMs}ms
                    
                    
                      Cost/Request
                      {provider.costPerRequest}
                    
                    {provider.defaultModel && (
                      
                        Default Model
                        {provider.defaultModel}
                      
                    )}
                    {provider.activeRuntimeAccess && (
                      
                        Runtime Auth
                        {provider.activeRuntimeAccess}
                      
                    )}
                  

                  
                    
                      {provider.name === 'codex' && 'Best for: coding tasks, refactors, and balanced engineering work'}
                      {provider.name === 'claude' && 'Best for: debugging, reasoning, and long-context analysis'}
                      {provider.name === 'gemini' && 'Best for: cost-sensitive runs, multimodal work, and fast iteration'}
                      {provider.name === 'kimi' && 'Best for: architecture planning, long-context understanding, and scalable design direction'}
                      {provider.name === 'deepseek' && 'Best for: security review, cost efficiency, and operational risk checks'}
                    
                    {provider.runtimeAccessModes && provider.runtimeAccessModes.length > 0 && (
                      
                        Access modes: {provider.runtimeAccessModes.join(' | ')}
                      
                    )}
                    {provider.notes?.[0] && (
                      {provider.notes[0]}
                    )}
                  
                
              ))}
            
          )}
        
      

      
        
          Access Model
          
            AgentX runs server-side and coordinates the collaborative provider graph. Browser logins do not power this runtime.
          
        
        
          
            Subscription or browser sign-in is still useful in provider-owned tools, but it does not power this VM runtime.
          
          
            Collaborative mode prefers role-specialized providers first. If a stage is unavailable, Ops Hub routes to the next configured provider rather than failing the whole run immediately.
          
          
            AgentX / Vertex env
            
              GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_CLOUD_PROJECT, GCP_PROJECT_ID, VERTEX_AI_LOCATION, VERTEX_CHAT_MODEL
            
          
          
            Codex env
            
              OPS_HUB_CODEX_TRANSPORT, GITHUB_MODELS_TOKEN, GITHUB_TOKEN, OPENAI_API_KEY, AI_INTEGRATIONS_OPENAI_API_KEY
            
          
          
            Claude / Gemini env
            
              ANTHROPIC_API_KEY, AI_INTEGRATIONS_ANTHROPIC_API_KEY, GEMINI_API_KEY, GOOGLE_AI_API_KEY, AI_INTEGRATIONS_GEMINI_API_KEY
            
          
          
            Kimi / DeepSeek env
            
              KIMI_API_KEY, MOONSHOT_API_KEY, KIMI_BASE_URL, DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL
            
          
        
      

      {status?.breakdown && Object.keys(status.breakdown).length > 0 && (
        
          
            Usage Breakdown
            
              Request distribution across configured providers
            
          
          
            
              {Object.entries(status.breakdown).map(([provider, stats]) => {
                const percentage = status.totalRequests > 0
                  ? ((stats.count / status.totalRequests) * 100).toFixed(1)
                  : '0';

                return (
                  
                    
                      
                      
                        {PROVIDER_LABELS[provider] || provider}
                      
                    
                    
                      
                        
                      
                    
                    
                      {stats.count} reqs
                      ${stats.cost.toFixed(4)}
                      {stats.avgLatency.toFixed(0)}ms
                    
                  
                );
              })}
            
          
        
      )}

      
        
          AgentX Control Surface
          
            The Insights view exposes the simplified entry point, but the execution path behind it is now collaborative.
          
        
        
          
            
              Mode Selection
              
                
                  Execute
                
                
                  Plan
                
              
              
                `Execute` applies a `Simple Edit` to the selected workspace file. `Plan` returns steps without changing files.
              
            

            
              Model Selector
              
                Ensemble routing
              
              
                Provider routing is internal. AgentX assigns architecture, reasoning, security, UX, and synthesis roles automatically.
              
            
          

          
            
            Use the right-side `AgentX - The Architect` panel for requests. Open a workspace file first when you want an edit applied.
          
        
      
    
  );
}