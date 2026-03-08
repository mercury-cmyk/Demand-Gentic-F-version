import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Activity,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock,
  Cpu,
  DollarSign,
  RefreshCw,
  Send,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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

interface TestResult {
  provider: string;
  model?: string;
  transport?: string;
  content: string;
  tokensUsed?: number;
  costEstimate?: number;
  latencyMs?: number;
}

type ProviderMode = 'auto' | 'manual';
type PreferredProvider = 'codex' | 'claude' | 'gemini';
type OptimizationProfile = 'quality' | 'balanced' | 'cost';

const PROVIDER_COLORS: Record<string, string> = {
  codex: 'bg-violet-500',
  claude: 'bg-orange-500',
  gemini: 'bg-blue-500',
};

const PROVIDER_LABELS: Record<string, string> = {
  codex: 'Codex',
  claude: 'Claude (Anthropic)',
  gemini: 'Gemini (Google)',
};

export default function AgentsTab() {
  const { toast } = useToast();
  const [status, setStatus] = useState<OrchestratorStatus | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [testPrompt, setTestPrompt] = useState('');
  const [testTask, setTestTask] = useState<string>('general');
  const [providerMode, setProviderMode] = useState<ProviderMode>('auto');
  const [preferredProvider, setPreferredProvider] = useState<PreferredProvider>('codex');
  const [optimizationProfile, setOptimizationProfile] = useState<OptimizationProfile>('balanced');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const data = await apiJsonRequest<{
        status: OrchestratorStatus;
        providers: ProviderInfo[];
      }>('GET', '/api/ops/agents/status');
      setStatus(data.status);
      setProviders(data.providers || []);
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

  const handleTest = async () => {
    if (!testPrompt.trim()) {
      toast({
        title: 'Enter a prompt',
        description: 'Provide a test prompt to send to the agent orchestrator.',
        variant: 'destructive',
      });
      return;
    }

    setTesting(true);
    setTestResult(null);

    try {
      const data = await apiJsonRequest<{
        response: TestResult;
      }>('POST', '/api/ops/agents/test', {
          prompt: testPrompt,
          task: testTask,
          providerMode,
          preferredProvider,
          optimizationProfile,
        });

      setTestResult(data.response);
      toast({
        title: 'Test complete',
        description: `Routed to ${data.response.provider} in ${data.response.latencyMs}ms`,
      });
    } catch (err) {
      toast({
        title: 'Test failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setTesting(false);
    }
  };

  const availableCount = providers.filter((provider) => provider.available).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Providers Available</p>
                <p className="text-2xl font-bold text-white">{availableCount}/{providers.length}</p>
              </div>
              <div className="p-3 bg-green-500/10 rounded-lg">
                <Bot className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Total Requests</p>
                <p className="text-2xl font-bold text-white">{status?.totalRequests ?? 0}</p>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <Activity className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Avg Latency</p>
                <p className="text-2xl font-bold text-white">{status?.avgLatency ?? '--'}ms</p>
              </div>
              <div className="p-3 bg-yellow-500/10 rounded-lg">
                <Clock className="w-6 h-6 text-yellow-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Total Cost</p>
                <p className="text-2xl font-bold text-white">${status?.totalCost ?? '0.0000'}</p>
              </div>
              <div className="p-3 bg-purple-500/10 rounded-lg">
                <DollarSign className="w-6 h-6 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-white">AI Providers</CardTitle>
            <CardDescription className="text-slate-400">
              Codex, Claude, and Gemini status with default model visibility for Ops Hub routing.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchStatus} className="border-slate-600">
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {providers.map((provider) => (
                <div
                  key={provider.name}
                  className={`p-4 rounded-lg border ${
                    provider.available
                      ? 'border-slate-600 bg-slate-700/50'
                      : 'border-slate-700 bg-slate-800/50 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${PROVIDER_COLORS[provider.name] || 'bg-gray-500'}`} />
                      <span className="font-semibold text-white">
                        {provider.label || PROVIDER_LABELS[provider.name] || provider.name}
                      </span>
                    </div>
                    {provider.available ? (
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Online
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-slate-400 border-slate-600">
                        <XCircle className="w-3 h-3 mr-1" />
                        Offline
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Success Rate</span>
                      <span className="text-white">{provider.successRate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Avg Latency</span>
                      <span className="text-white">{provider.avgLatencyMs}ms</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Cost/Request</span>
                      <span className="text-white">{provider.costPerRequest}</span>
                    </div>
                    {provider.defaultModel && (
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-400">Default Model</span>
                        <span className="text-white text-right truncate">{provider.defaultModel}</span>
                      </div>
                    )}
                    {provider.activeRuntimeAccess && (
                      <div className="flex justify-between gap-4">
                        <span className="text-slate-400">Runtime Auth</span>
                        <span className="text-white text-right">{provider.activeRuntimeAccess}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-600">
                    <p className="text-xs text-slate-400">
                      {provider.name === 'codex' && 'Best for: coding tasks, refactors, and balanced engineering work'}
                      {provider.name === 'claude' && 'Best for: debugging, reasoning, and long-context analysis'}
                      {provider.name === 'gemini' && 'Best for: cost-sensitive runs, multimodal work, and fast iteration'}
                    </p>
                    {provider.runtimeAccessModes && provider.runtimeAccessModes.length > 0 && (
                      <p className="text-[11px] text-slate-500 mt-2">
                        Access modes: {provider.runtimeAccessModes.join(' | ')}
                      </p>
                    )}
                    {provider.notes?.[0] && (
                      <p className="text-[11px] text-slate-500 mt-2">{provider.notes[0]}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Access Model</CardTitle>
          <CardDescription className="text-slate-400">
            Ops Hub runs the coding agent on the server, so runtime calls use stored credentials instead of vendor web sessions.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-slate-300">
          <p>Subscription or browser sign-in is still useful in provider-owned tools, but it does not power this VM runtime.</p>
          <p>Codex can now use either OpenAI API keys or a GitHub Models token. Claude remains Anthropic API key based, and Gemini remains Gemini API key based in the Ops runtime.</p>
          <p className="text-slate-400">Codex env: <code>OPS_HUB_CODEX_TRANSPORT</code>, <code>GITHUB_MODELS_TOKEN</code>, <code>GITHUB_TOKEN</code>, <code>OPENAI_API_KEY</code>, <code>AI_INTEGRATIONS_OPENAI_API_KEY</code>.</p>
          <p className="text-slate-400">Claude env: <code>ANTHROPIC_API_KEY</code> or <code>AI_INTEGRATIONS_ANTHROPIC_API_KEY</code>. Gemini env: <code>GEMINI_API_KEY</code>, <code>GOOGLE_AI_API_KEY</code>, or <code>AI_INTEGRATIONS_GEMINI_API_KEY</code>.</p>
        </CardContent>
      </Card>

      {status?.breakdown && Object.keys(status.breakdown).length > 0 && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Usage Breakdown</CardTitle>
            <CardDescription className="text-slate-400">
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
                    <div className="flex items-center gap-2 w-40">
                      <div className={`w-3 h-3 rounded-full ${PROVIDER_COLORS[provider] || 'bg-gray-500'}`} />
                      <span className="text-sm text-white font-medium">
                        {PROVIDER_LABELS[provider] || provider}
                      </span>
                    </div>
                    <div className="flex-1">
                      <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${PROVIDER_COLORS[provider] || 'bg-gray-500'} rounded-full transition-all`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-slate-300 w-48">
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

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Routing Rules</CardTitle>
          <CardDescription className="text-slate-400">
            Auto mode priorities for code quality, balance, and cost.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              {
                task: 'Code Generation',
                icon: Cpu,
                route: 'Codex -> Claude -> Gemini',
                desc: 'Simple edits and general coding favor Codex first in quality and balanced modes.',
              },
              {
                task: 'Reasoning & Analysis',
                icon: TrendingUp,
                route: 'Claude -> Codex -> Gemini',
                desc: 'Debugging and architecture lean on Claude first when quality matters most.',
              },
              {
                task: 'Multimodal',
                icon: Zap,
                route: 'Gemini -> Claude',
                desc: 'Gemini handles multimodal workloads first, with Claude as the fallback.',
              },
              {
                task: 'Cost Profile',
                icon: BarChart3,
                route: 'Gemini -> Codex -> Claude',
                desc: 'Cost mode starts with Gemini and only escalates when the task needs more depth.',
              },
            ].map((rule) => (
              <div key={rule.task} className="p-3 rounded-lg border border-slate-600 bg-slate-700/30">
                <div className="flex items-center gap-2 mb-1">
                  <rule.icon className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium text-white">{rule.task}</span>
                </div>
                <p className="text-xs text-blue-400 mb-1">{rule.route}</p>
                <p className="text-xs text-slate-400">{rule.desc}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Agent Playground</CardTitle>
          <CardDescription className="text-slate-400">
            Exercise the same auto/manual provider contract used by the Ops Hub coding agent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Select value={providerMode} onValueChange={(value) => setProviderMode(value as ProviderMode)}>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto Select</SelectItem>
                <SelectItem value="manual">Manual Select</SelectItem>
              </SelectContent>
            </Select>

            <Select value={optimizationProfile} onValueChange={(value) => setOptimizationProfile(value as OptimizationProfile)}>
              <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="quality">Excellent Code Quality</SelectItem>
                <SelectItem value="balanced">Balanced</SelectItem>
                <SelectItem value="cost">Cost Optimized</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={preferredProvider}
              onValueChange={(value) => setPreferredProvider(value as PreferredProvider)}
              disabled={providerMode !== 'manual'}
            >
              <SelectTrigger className="bg-slate-700 border-slate-600 text-white disabled:opacity-60">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="codex">Codex</SelectItem>
                <SelectItem value="claude">Claude</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <Textarea
                placeholder="Enter a test prompt..."
                value={testPrompt}
                onChange={(e) => setTestPrompt(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-400 min-h-[80px]"
              />
            </div>
            <div className="flex flex-col gap-2 w-40">
              <Select value={testTask} onValueChange={setTestTask}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General</SelectItem>
                  <SelectItem value="code">Code</SelectItem>
                  <SelectItem value="reasoning">Reasoning</SelectItem>
                  <SelectItem value="analysis">Analysis</SelectItem>
                  <SelectItem value="multimodal">Multimodal</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={handleTest} disabled={testing} className="w-full">
                {testing ? (
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {testing ? 'Running...' : 'Test'}
              </Button>
            </div>
          </div>

          {testResult && (
            <div className="p-4 rounded-lg border border-slate-600 bg-slate-700/30">
              <div className="flex items-center gap-4 mb-3 flex-wrap">
                <Badge className={`${PROVIDER_COLORS[testResult.provider] || 'bg-slate-500'} text-white`}>
                  {PROVIDER_LABELS[testResult.provider] || testResult.provider}
                </Badge>
                {testResult.model && (
                  <span className="text-xs text-slate-400">{testResult.model}</span>
                )}
                {testResult.transport && (
                  <span className="text-xs text-slate-400">{testResult.transport}</span>
                )}
                {testResult.latencyMs && (
                  <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {testResult.latencyMs}ms
                  </span>
                )}
                {testResult.tokensUsed && (
                  <span className="text-xs text-slate-400">{testResult.tokensUsed} tokens</span>
                )}
                {testResult.costEstimate !== undefined && (
                  <span className="text-xs text-slate-400">${testResult.costEstimate.toFixed(6)}</span>
                )}
              </div>
              <pre className="text-sm text-slate-200 whitespace-pre-wrap font-mono bg-slate-800 p-3 rounded max-h-60 overflow-y-auto">
                {testResult.content}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
