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
  breakdown: Record<string, ProviderBreakdown>;
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

const PROVIDER_COLORS: Record<string, string> = {
  codex: 'bg-violet-500',
  claude: 'bg-orange-500',
  gemini: 'bg-blue-500',
  kimi: 'bg-emerald-500',
  deepseek: 'bg-rose-500',
  ensemble: 'bg-slate-900',
};

const PROVIDER_LABELS: Record<string, string> = {
  codex: 'Codex',
  claude: 'Claude (Anthropic)',
  gemini: 'Gemini (Google)',
  kimi: 'Kimi (Moonshot)',
  deepseek: 'DeepSeek',
};

export default function AgentsTab() {
  const [status, setStatus] = useState<OrchestratorStatus | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [workflow, setWorkflow] = useState<WorkflowStep[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiJsonRequest<{
        status: OrchestratorStatus;
        providers: ProviderInfo[];
        workflow: WorkflowStep[];
      }>('GET', '/api/ops/agents/status');
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
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card className="border-black/5 bg-white/90 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Providers</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{availableCount}/{providers.length}</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3">
                <Bot className="w-6 h-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-black/5 bg-white/90 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Requests</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{status?.totalRequests ?? 0}</p>
              </div>
              <div className="rounded-2xl bg-sky-50 p-3">
                <Activity className="w-6 h-6 text-sky-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-black/5 bg-white/90 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Avg Latency</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{status?.avgLatency ?? '--'}ms</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-3">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-black/5 bg-white/90 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Total Cost</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">${status?.totalCost ?? '0.0000'}</p>
              </div>
              <div className="rounded-2xl bg-violet-50 p-3">
                <DollarSign className="w-6 h-6 text-violet-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-black/5 bg-[linear-gradient(135deg,#ffffff_0%,#f7f3ea_100%)] shadow-sm">
        <CardContent className="flex flex-col gap-6 p-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <Badge className="border border-slate-200 bg-white text-slate-600">Collaborative Coding Orchestrator</Badge>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">AgentX Ensemble</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              Ops Hub now routes coding work through a staged ensemble: Kimi for architecture, Claude for reasoning, DeepSeek for security and cost, Gemini for UX and performance, and Codex for final synthesis.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Execution</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">Staged multi-agent review</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">Fallback</p>
              <p className="mt-2 text-sm font-semibold text-slate-900">Single-provider recovery path</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {workflow.length > 0 && (
        <Card className="border-black/5 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-900">Collaborative Workflow</CardTitle>
            <CardDescription className="text-slate-500">
              Default role assignments used when AgentX runs collaborative coding mode.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-5 md:grid-cols-2">
              {workflow.map((step) => (
                <div
                  key={step.role}
                  className={`rounded-2xl border p-4 shadow-sm ${
                    step.available
                      ? 'border-slate-200 bg-[#fcfbf7]'
                      : 'border-slate-200 bg-slate-50 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        {step.roleLabel}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">{step.label}</p>
                    </div>
                    <div className={`h-3 w-3 rounded-full ${PROVIDER_COLORS[step.provider] || 'bg-gray-500'}`} />
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-slate-500">{step.purpose}</p>
                  <div className="mt-4 border-t border-slate-200 pt-3 text-[11px] text-slate-500">
                    <p>Default model: {step.defaultModel}</p>
                    <p className="mt-1">{step.available ? 'Configured' : 'Waiting for credentials'}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-black/5 bg-white/90 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-slate-900">Collaborative Providers</CardTitle>
            <CardDescription className="text-slate-500">
              Each provider has a distinct role in collaborative coding mode, and can also serve as a routed fallback when another stage is unavailable.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchStatus} className="border-slate-200 bg-white">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {providers.map((provider) => (
                <div
                  key={provider.name}
                  className={`rounded-2xl border p-4 shadow-sm ${
                    provider.available
                      ? 'border-slate-200 bg-[#fcfbf7]'
                      : 'border-slate-200 bg-slate-50 opacity-70'
                  }`}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${PROVIDER_COLORS[provider.name] || 'bg-gray-500'}`} />
                      <span className="font-semibold text-slate-900">
                        {provider.label || PROVIDER_LABELS[provider.name] || provider.name}
                      </span>
                    </div>
                    {provider.available ? (
                      <Badge className="border border-emerald-200 bg-emerald-50 text-emerald-700">
                        <CheckCircle2 className="mr-1 w-3 h-3" />
                        Online
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-slate-200 bg-white text-slate-500">
                        <XCircle className="mr-1 w-3 h-3" />
                        Offline
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Success Rate</span>
                      <span className="text-slate-900">{provider.successRate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Avg Latency</span>
                      <span className="text-slate-900">{provider.avgLatencyMs}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Cost/Request</span>
                      <span className="text-slate-900">{provider.costPerRequest}</span>
                    </div>
                    {provider.defaultModel && (
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Default Model</span>
                        <span className="truncate text-right text-slate-900">{provider.defaultModel}</span>
                      </div>
                    )}
                    {provider.activeRuntimeAccess && (
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-500">Runtime Auth</span>
                        <span className="text-right text-slate-900">{provider.activeRuntimeAccess}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 border-t border-slate-200 pt-3">
                    <p className="text-xs text-slate-500">
                      {provider.name === 'codex' && 'Best for: coding tasks, refactors, and balanced engineering work'}
                      {provider.name === 'claude' && 'Best for: debugging, reasoning, and long-context analysis'}
                      {provider.name === 'gemini' && 'Best for: cost-sensitive runs, multimodal work, and fast iteration'}
                      {provider.name === 'kimi' && 'Best for: architecture planning, long-context understanding, and scalable design direction'}
                      {provider.name === 'deepseek' && 'Best for: security review, cost efficiency, and operational risk checks'}
                    </p>
                    {provider.runtimeAccessModes && provider.runtimeAccessModes.length > 0 && (
                      <p className="mt-2 text-[11px] text-slate-400">
                        Access modes: {provider.runtimeAccessModes.join(' | ')}
                      </p>
                    )}
                    {provider.notes?.[0] && (
                      <p className="mt-2 text-[11px] text-slate-400">{provider.notes[0]}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-black/5 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="text-slate-900">Access Model</CardTitle>
          <CardDescription className="text-slate-500">
            AgentX runs server-side and coordinates the collaborative provider graph. Browser logins do not power this runtime.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <div className="rounded-2xl border border-slate-200 bg-[#fbfaf6] px-4 py-3">
            Subscription or browser sign-in is still useful in provider-owned tools, but it does not power this VM runtime.
          </div>
          <div className="rounded-2xl border border-slate-200 bg-[#fbfaf6] px-4 py-3">
            Collaborative mode prefers role-specialized providers first. If a stage is unavailable, Ops Hub routes to the next configured provider rather than failing the whole run immediately.
          </div>
          <div className="rounded-2xl border border-slate-200 bg-[#fbfaf6] px-4 py-3">
            <p className="font-medium text-slate-700">AgentX / Vertex env</p>
            <p className="mt-1 text-slate-500">
              <code>GOOGLE_APPLICATION_CREDENTIALS</code>, <code>GOOGLE_CLOUD_PROJECT</code>, <code>GCP_PROJECT_ID</code>, <code>VERTEX_AI_LOCATION</code>, <code>VERTEX_CHAT_MODEL</code>
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-[#fbfaf6] px-4 py-3">
            <p className="font-medium text-slate-700">Codex env</p>
            <p className="mt-1 text-slate-500">
              <code>OPS_HUB_CODEX_TRANSPORT</code>, <code>GITHUB_MODELS_TOKEN</code>, <code>GITHUB_TOKEN</code>, <code>OPENAI_API_KEY</code>, <code>AI_INTEGRATIONS_OPENAI_API_KEY</code>
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-[#fbfaf6] px-4 py-3">
            <p className="font-medium text-slate-700">Claude / Gemini env</p>
            <p className="mt-1 text-slate-500">
              <code>ANTHROPIC_API_KEY</code>, <code>AI_INTEGRATIONS_ANTHROPIC_API_KEY</code>, <code>GEMINI_API_KEY</code>, <code>GOOGLE_AI_API_KEY</code>, <code>AI_INTEGRATIONS_GEMINI_API_KEY</code>
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-[#fbfaf6] px-4 py-3">
            <p className="font-medium text-slate-700">Kimi / DeepSeek env</p>
            <p className="mt-1 text-slate-500">
              <code>KIMI_API_KEY</code>, <code>MOONSHOT_API_KEY</code>, <code>KIMI_BASE_URL</code>, <code>DEEPSEEK_API_KEY</code>, <code>DEEPSEEK_BASE_URL</code>
            </p>
          </div>
        </CardContent>
      </Card>

      {status?.breakdown && Object.keys(status.breakdown).length > 0 && (
        <Card className="border-black/5 bg-white/90 shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-900">Usage Breakdown</CardTitle>
            <CardDescription className="text-slate-500">
              Request distribution across configured providers
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(status.breakdown).map(([provider, stats]) => {
                const percentage = status.totalRequests > 0
                  ? ((stats.count / status.totalRequests) * 100).toFixed(1)
                  : '0';

                return (
                  <div key={provider} className="flex items-center gap-4">
                    <div className="flex w-40 items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${PROVIDER_COLORS[provider] || 'bg-gray-500'}`} />
                      <span className="text-sm font-medium text-slate-900">
                        {PROVIDER_LABELS[provider] || provider}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${PROVIDER_COLORS[provider] || 'bg-gray-500'} transition-all`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex w-48 items-center gap-4 text-sm text-slate-500">
                      <span>{stats.count} reqs</span>
                      <span>${stats.cost.toFixed(4)}</span>
                      <span>{stats.avgLatency.toFixed(0)}ms</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-black/5 bg-white/90 shadow-sm">
        <CardHeader>
          <CardTitle className="text-slate-900">AgentX Control Surface</CardTitle>
          <CardDescription className="text-slate-500">
            The Insights view exposes the simplified entry point, but the execution path behind it is now collaborative.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-[#fbfaf6] p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Mode Selection</p>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <div className="rounded-full border border-slate-900 bg-slate-900 px-3 py-1.5 text-[11px] font-medium text-white">
                  Execute
                </div>
                <div className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600">
                  Plan
                </div>
              </div>
              <p className="mt-2.5 text-xs text-slate-500">
                `Execute` applies a `Simple Edit` to the selected workspace file. `Plan` returns steps without changing files.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-[#fbfaf6] p-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Model Selector</p>
              <div className="mt-2.5 inline-flex rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-900">
                Ensemble routing
              </div>
              <p className="mt-2.5 text-xs text-slate-500">
                Provider routing is internal. AgentX assigns architecture, reasoning, security, UX, and synthesis roles automatically.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-[#fbfaf6] px-4 py-3 text-sm text-slate-600">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
            <span>Use the right-side `AgentX - The Architect` panel for requests. Open a workspace file first when you want an edit applied.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
