import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Bot,
  Cpu,
  Zap,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  Send,
  RefreshCw,
  Activity,
  BarChart3,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ProviderInfo {
  name: string;
  available: boolean;
  avgLatencyMs: number;
  successRate: string;
  costPerRequest: string;
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
  providers: Record<string, { successRate: number; avgLatencyMs: number; costPerRequest: number; availability: boolean }>;
  breakdown: Record<string, ProviderBreakdown>;
}

interface TestResult {
  provider: string;
  content: string;
  tokensUsed?: number;
  costEstimate?: number;
  latencyMs?: number;
}

const PROVIDER_COLORS: Record<string, string> = {
  copilot: 'bg-purple-500',
  claude: 'bg-orange-500',
  gemini: 'bg-blue-500',
};

const PROVIDER_LABELS: Record<string, string> = {
  copilot: 'GitHub Copilot',
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
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/ops/agents/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data.status);
        setProviders(data.providers || []);
      }
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
      toast({ title: 'Enter a prompt', description: 'Provide a test prompt to send to the agent orchestrator.', variant: 'destructive' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/ops/agents/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: testPrompt, task: testTask }),
      });
      if (res.ok) {
        const data = await res.json();
        setTestResult(data.response);
        toast({ title: 'Test complete', description: `Routed to ${data.response.provider} in ${data.response.latencyMs}ms` });
      } else {
        const err = await res.json();
        toast({ title: 'Test failed', description: err.error || 'Unknown error', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Test failed', description: String(err), variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  const availableCount = providers.filter(p => p.available).length;
  const totalProviders = providers.length;

  return (
    <div className="space-y-6">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Providers Available</p>
                <p className="text-2xl font-bold text-white">{availableCount}/{totalProviders}</p>
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
                <p className="text-2xl font-bold text-white">{status?.avgLatency ?? '—'}ms</p>
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

      {/* Providers Grid */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-white">AI Providers</CardTitle>
            <CardDescription className="text-slate-400">
              Multi-provider orchestration — requests are routed to the optimal provider based on task type, cost, and availability.
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
                        {PROVIDER_LABELS[provider.name] || provider.name}
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
                  </div>

                  {/* Routing info */}
                  <div className="mt-3 pt-3 border-t border-slate-600">
                    <p className="text-xs text-slate-400">
                      {provider.name === 'copilot' && 'Best for: Code suggestions, inline completions'}
                      {provider.name === 'claude' && 'Best for: Reasoning, analysis, long context'}
                      {provider.name === 'gemini' && 'Best for: Multimodal, cost-effective, GCP tasks'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Usage Breakdown */}
      {status?.breakdown && Object.keys(status.breakdown).length > 0 && (
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">Usage Breakdown</CardTitle>
            <CardDescription className="text-slate-400">
              Request distribution across providers
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

      {/* Routing Rules */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Routing Rules</CardTitle>
          <CardDescription className="text-slate-400">
            How tasks are automatically routed to providers
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { task: 'Code Generation', icon: Cpu, route: 'Copilot → Claude', desc: 'Inline suggestions via Copilot, complex generation via Claude' },
              { task: 'Reasoning & Analysis', icon: TrendingUp, route: 'Claude → Gemini', desc: 'Deep reasoning with Claude, cost-effective analysis via Gemini' },
              { task: 'Multimodal', icon: Zap, route: 'Gemini → Claude', desc: 'Image/audio processing with Gemini, fallback to Claude' },
              { task: 'General Tasks', icon: BarChart3, route: 'Cost-optimized', desc: 'Routes to cheapest available provider, or best quality' },
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

      {/* Test Playground */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader>
          <CardTitle className="text-white">Agent Playground</CardTitle>
          <CardDescription className="text-slate-400">
            Test the multi-provider orchestrator with a prompt
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
              <div className="flex items-center gap-4 mb-3">
                <Badge className={`${PROVIDER_COLORS[testResult.provider]} text-white`}>
                  {PROVIDER_LABELS[testResult.provider] || testResult.provider}
                </Badge>
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
