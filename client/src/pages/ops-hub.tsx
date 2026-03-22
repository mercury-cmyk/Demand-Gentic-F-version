import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Lock,
  FileText,
  BarChart3,
  Zap,
  Globe,
  Bot,
  FolderOpen,
  Eye,
  Search,
  Bell,
  User,
  Plus,
  Send,
  Loader2,
  Code2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Terminal,
  Rocket,
  Activity,
  Server,
  RefreshCw,
  Download,
  Play,
  Square,
  Box,
  Monitor,
  Mic,
  MicOff,
  Sparkles,
  GitBranch,
  ArrowRight,
  X,
  Upload,
  Brain,
  Wand2,
  CircleDot,
} from 'lucide-react';
import CostsTab from '@/components/ops/costs-tab';
import DeploymentsTab from '@/components/ops/deployments-tab';
import DomainsTab from '@/components/ops/domains-tab';
import AgentsTab from '@/components/ops/agents-tab';
import FileManagerTab, {
  OpsWorkspaceFileContext,
  WorkspaceDirectoryResponse,
  WorkspaceFileResponse,
} from '@/components/ops/file-manager-tab';
import PreviewTab from '@/components/ops/preview-tab';
import WorkstationsTab from '@/components/ops/workstations-tab';
import IamSecrets from '@/pages/iam/iam-secrets';
const CloudLogsMonitor = React.lazy(() => import('@/pages/cloud-logs-monitor'));
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { apiJsonRequest } from '@/lib/queryClient';

/* ── Interfaces ── */
interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  provider?: string;
  model?: string;
  transport?: string;
  applied?: boolean;
  isError?: boolean;
  retryPrompt?: string;
}

interface OpsOverview {
  deploymentTarget: 'local' | 'vm';
  mode: 'local' | 'ops-agent';
  previewBaseUrl: string;
  workspaceRoot: string;
  currentBranch: string | null;
  currentCommit: string | null;
  canEditWorkspace: boolean;
  canManageDeployments: boolean;
  composeFilePath: string;
  opsAgentReachable: boolean;
}

export type DeployTarget = 'vm' | 'cloud-run';

export interface ProjectService {
  name: string;
  label: string;
  dockerComposeService?: string;
  cloudRunService?: string;
  imageUrl?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'running' | 'stopped' | 'deploying';
  environment: 'production' | 'development' | 'staging';
  icon: string;
  deployTarget: DeployTarget;
  services: ProjectService[];
}

interface NavSection {
  label: string;
  items: { id: string; label: string; icon: React.ReactNode; badge?: string }[];
}

type CodingAgentProvider = 'agentx' | 'ensemble' | 'codex' | 'claude' | 'gemini' | 'kimi' | 'deepseek';
type CodingAgentRunMode = 'agent' | 'plan';
type CodingAgentModelSelector = 'simple-edit' | 'multi-edit';

/* ── Architect planning step ── */
interface ArchitectStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
  detail?: string;
}

const INITIAL_ARCHITECT_STEPS: ArchitectStep[] = [
  { id: 'analyze', label: 'Analyzing code & context', status: 'pending' },
  { id: 'optimize', label: 'Optimizing prompt', status: 'pending' },
  { id: 'plan', label: 'Planning changes', status: 'pending' },
  { id: 'apply', label: 'Applying edits', status: 'pending' },
];

const PROVIDER_ROUTING: Record<CodingAgentProvider, { label: string; color: string; desc: string }> = {
  kimi: { label: 'Kimi (Primary)', color: 'bg-emerald-500', desc: 'Architecture & code generation' },
  claude: { label: 'Claude', color: 'bg-orange-500', desc: 'Reasoning & validation' },
  gemini: { label: 'Gemini', color: 'bg-blue-500', desc: 'UX & performance' },
  deepseek: { label: 'DeepSeek', color: 'bg-rose-500', desc: 'Security & cost' },
  codex: { label: 'Codex', color: 'bg-violet-500', desc: 'Final synthesis' },
  agentx: { label: 'AgentC', color: 'bg-slate-900', desc: 'Orchestrator' },
  ensemble: { label: 'Ensemble', color: 'bg-indigo-600', desc: 'Multi-agent pipeline' },
};

/* ── Projects configuration ── */
const PROJECTS: Project[] = [
  {
    id: 'demandgentic',
    name: 'DemandGentic AI',
    description: 'Main platform — API, voice engine, campaigns',
    status: 'running',
    environment: 'production',
    icon: '🚀',
    deployTarget: 'vm',
    services: [
      { name: 'api', label: 'API Server', dockerComposeService: 'api' },
      { name: 'nginx', label: 'Nginx Proxy', dockerComposeService: 'nginx' },
      { name: 'ops-agent', label: 'Ops Agent', dockerComposeService: 'ops-agent' },
      { name: 'certbot', label: 'Certbot SSL', dockerComposeService: 'certbot' },
    ],
  },
  {
    id: 'media-bridge',
    name: 'Media Bridge',
    description: 'RTP ↔ Gemini Live audio bridge',
    status: 'running',
    environment: 'production',
    icon: '🎙️',
    deployTarget: 'vm',
    services: [
      { name: 'media-bridge', label: 'Media Bridge', dockerComposeService: 'media-bridge' },
    ],
  },
  {
    id: 'drachtio',
    name: 'Drachtio SIP',
    description: 'SIP signaling server',
    status: 'running',
    environment: 'production',
    icon: '📞',
    deployTarget: 'vm',
    services: [
      { name: 'drachtio', label: 'Drachtio Server', dockerComposeService: 'drachtio' },
    ],
  },
  {
    id: 'cloud-services',
    name: 'Cloud Run Services',
    description: 'GCP Cloud Run managed services',
    status: 'running',
    environment: 'production',
    icon: '☁️',
    deployTarget: 'cloud-run',
    services: [
      { name: 'demandgentic-api', label: 'API (Cloud Run)', cloudRunService: 'demandgentic-api', imageUrl: 'gcr.io/demandgentic/demandgentic-api:latest' },
    ],
  },
];

const SERVICE_MAP: Record<string, string> = {
  demandgentic: 'api',
  'media-bridge': 'media-bridge',
  drachtio: 'drachtio',
  'cloud-services': 'demandgentic-api',
};

/* ── Navigation ── */
const NAV_SECTIONS: NavSection[] = [
  {
    label: 'WORKSPACE',
    items: [
      { id: 'files', label: 'File Manager', icon: <FolderOpen className="w-4 h-4" /> },
      { id: 'preview', label: 'Live Preview', icon: <Eye className="w-4 h-4" /> },
    ],
  },
  {
    label: 'DEVOPS',
    items: [
      { id: 'workstations', label: 'Workstations', icon: <Monitor className="w-4 h-4" /> },
      { id: 'deployments', label: 'Deployments', icon: <Rocket className="w-4 h-4" /> },
      { id: 'domains', label: 'Domains & DNS', icon: <Globe className="w-4 h-4" /> },
      { id: 'secrets', label: 'Secrets & Env', icon: <Lock className="w-4 h-4" /> },
    ],
  },
  {
    label: 'INSIGHTS',
    items: [
      { id: 'logs', label: 'Container Logs', icon: <Terminal className="w-4 h-4" /> },
      { id: 'vm-logs', label: 'VM Live Logs', icon: <Activity className="w-4 h-4" /> },
      { id: 'costs', label: 'Cost Analytics', icon: <BarChart3 className="w-4 h-4" /> },
      { id: 'agents', label: 'AI Agents', icon: <Bot className="w-4 h-4" /> },
    ],
  },
];

const TOP_TABS = [
  { id: 'workspace', label: 'Workspace', icon: <Code2 className="w-4 h-4" /> },
  { id: 'devops', label: 'DevOps', icon: <Server className="w-4 h-4" /> },
  { id: 'insights', label: 'Insights', icon: <Activity className="w-4 h-4" /> },
];

const TAB_TO_SECTION: Record<string, string> = {
  workspace: 'WORKSPACE',
  devops: 'DEVOPS',
  insights: 'INSIGHTS',
};

const SECONDARY_NAV_ORDER = ['DEVOPS', 'WORKSPACE', 'INSIGHTS'];

const AGENT_PROVIDER_LABELS: Record<CodingAgentProvider, string> = {
  agentx: 'AgentC',
  ensemble: 'AgentC Ensemble',
  codex: 'Codex',
  claude: 'Claude',
  gemini: 'Gemini',
  kimi: 'Kimi',
  deepseek: 'DeepSeek',
};

function normalizeOpsRole(role: unknown): string | null {
  if (typeof role === 'string') {
    const trimmed = role.trim().toLowerCase();
    return trimmed || null;
  }

  if (role && typeof role === 'object' && 'role' in role) {
    return normalizeOpsRole((role as { role?: unknown }).role);
  }

  return null;
}

function collectOpsRoles(roles: unknown): string[] {
  if (roles == null) {
    return [];
  }

  const values = Array.isArray(roles) ? roles : [roles];
  return values
    .map((value) => normalizeOpsRole(value))
    .filter((value): value is string => Boolean(value));
}

function parseOpsTokenPayload(token: string | null): Record<string, unknown> | null {
  if (!token) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');

  try {
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function getTopTabForPage(pageId: string): string {
  for (const section of NAV_SECTIONS) {
    if (section.items.some((item) => item.id === pageId)) {
      const tabEntry = Object.entries(TAB_TO_SECTION).find(([, label]) => label === section.label);
      return tabEntry?.[0] || 'workspace';
    }
  }
  return 'workspace';
}

function formatWorkspaceTimestamp(dateStr?: string): string {
  if (!dateStr) return '-';
  const value = new Date(dateStr);
  if (Number.isNaN(value.getTime())) return '-';

  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
}

function formatWorkspaceBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function FileSearchDrawerPanel({
  selectedFile,
  onSelectFile,
  onOpenInEditor,
}: {
  selectedFile: OpsWorkspaceFileContext | null;
  onSelectFile: (file: OpsWorkspaceFileContext) => void;
  onOpenInEditor: (path?: string) => void;
}) {
  const { toast } = useToast();
  const [directory, setDirectory] = useState<WorkspaceDirectoryResponse>({
    currentPath: '',
    breadcrumbs: [],
    entries: [],
  });
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const fetchDirectory = useCallback(async (nextPath: string = '') => {
    setLoadingDirectory(true);
    try {
      const params = new URLSearchParams();
      if (nextPath) params.set('path', nextPath);
      const data = await apiJsonRequest<{
        success: boolean;
        directory: WorkspaceDirectoryResponse;
        error?: string;
      }>('GET', `/api/ops/workspace?${params.toString()}`);
      if (!data.success) {
        throw new Error(data.error || 'Failed to load workspace directory');
      }

      setDirectory(data.directory);
    } catch (error) {
      toast({
        title: 'Workspace unavailable',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setLoadingDirectory(false);
    }
  }, [toast]);

  const openWorkspaceFile = useCallback(async (filePath: string) => {
    setLoadingFile(true);
    try {
      const data = await apiJsonRequest<{
        success: boolean;
        file: WorkspaceFileResponse;
        error?: string;
      }>('GET', `/api/ops/workspace/file?path=${encodeURIComponent(filePath)}`);
      if (!data.success) {
        throw new Error(data.error || 'Failed to open file');
      }

      onSelectFile({
        path: data.file.path,
        content: data.file.content,
        modifiedAt: data.file.modifiedAt,
        dirty: false,
      });
    } catch (error) {
      toast({
        title: 'Could not open file',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setLoadingFile(false);
    }
  }, [onSelectFile, toast]);

  useEffect(() => {
    void fetchDirectory('');
  }, [fetchDirectory]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) {
      return directory.entries;
    }

    const query = searchQuery.trim().toLowerCase();
    return directory.entries.filter((entry) => (
      entry.name.toLowerCase().includes(query)
      || entry.path.toLowerCase().includes(query)
    ));
  }, [directory.entries, searchQuery]);

  const navigateToPath = (nextPath: string) => {
    void fetchDirectory(nextPath);
  };

  const navigateUp = () => {
    const crumbs = directory.breadcrumbs.slice(0, -1);
    void fetchDirectory(crumbs.join('/'));
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-800">Workspace files</p>
            <p className="mt-1 text-xs text-slate-500">
              Search the live repo and hand a file to the editor or manager without sacrificing terminal space.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { void fetchDirectory(directory.currentPath); }}
            className="h-8 rounded-lg"
          >
            <RefreshCw className={`h-4 w-4 ${loadingDirectory ? 'animate-spin' : ''}`} />
          </Button>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder="Search files or folders..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-10 rounded-xl border-slate-200 bg-slate-50 pl-10 text-sm"
            />
          </div>
          {directory.currentPath && (
            <Button
              variant="outline"
              size="sm"
              onClick={navigateUp}
              className="h-10 rounded-xl px-3"
            >
              Up
            </Button>
          )}
        </div>
      </div>

      <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <div className="flex items-center gap-1.5 overflow-x-auto text-[11px] text-slate-500">
          <button
            onClick={() => navigateToPath('')}
            className="font-medium text-slate-600 transition hover:text-indigo-600"
          >
            /
          </button>
          {directory.breadcrumbs.map((crumb, index) => {
            const nextPath = directory.breadcrumbs.slice(0, index + 1).join('/');
            return (
              <React.Fragment key={nextPath}>
                <ChevronRight className="h-3 w-3 text-slate-300" />
                <button
                  onClick={() => navigateToPath(nextPath)}
                  className="truncate font-medium text-slate-600 transition hover:text-indigo-600"
                >
                  {crumb}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                Selected file
              </p>
              <p className="mt-1 truncate text-sm font-medium text-slate-800">
                {selectedFile?.path || 'No file selected yet'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenInEditor(selectedFile?.path)}
              disabled={!selectedFile}
              className="h-8 rounded-lg"
            >
              Open editor
            </Button>
          </div>

          {selectedFile ? (
            <>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                <span>{formatWorkspaceTimestamp(selectedFile.modifiedAt)}</span>
                <span>·</span>
                <span>{formatWorkspaceBytes(selectedFile.content.length)}</span>
              </div>
              <pre className="mt-3 max-h-32 overflow-y-auto rounded-lg bg-slate-950 px-3 py-2 text-[11px] leading-relaxed text-slate-100">
                {selectedFile.content.slice(0, 320) || 'Empty file'}
              </pre>
            </>
          ) : (
            <p className="mt-2 text-xs leading-relaxed text-slate-500">
              Pick a file to give the Coding Agent extra context, or just ask — the agent already knows which project you're in.
            </p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loadingDirectory ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">Loading workspace…</div>
        ) : filteredEntries.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-slate-400">
            No files matched the current filter.
          </div>
        ) : (
          <div className="space-y-1">
            {filteredEntries.map((entry) => {
              const isActive = selectedFile?.path === entry.path;
              return (
                <button
                  key={entry.path}
                  onClick={() => {
                    if (entry.type === 'directory') {
                      navigateToPath(entry.path);
                      return;
                    }
                    void openWorkspaceFile(entry.path);
                  }}
                  className={`w-full rounded-xl border px-3 py-3 text-left transition-all ${
                    isActive
                      ? 'border-indigo-200 bg-indigo-50/70 shadow-sm'
                      : 'border-transparent hover:border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      entry.type === 'directory' ? 'bg-amber-50' : 'bg-slate-100'
                    }`}>
                      {entry.type === 'directory' ? (
                        <FolderOpen className="h-4 w-4 text-amber-500" />
                      ) : (
                        <FileText className="h-4 w-4 text-slate-500" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{entry.name}</div>
                      <div className="truncate text-[11px] text-slate-500">
                        {entry.type === 'directory'
                          ? entry.path || '/'
                          : `${formatWorkspaceBytes(entry.size)} · ${formatWorkspaceTimestamp(entry.modifiedAt)}`}
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500">
        <span>
          {filteredEntries.length} item{filteredEntries.length === 1 ? '' : 's'}
        </span>
        {loadingFile && (
          <span className="ml-2 inline-flex items-center gap-1 font-medium text-indigo-600">
            <Loader2 className="h-3 w-3 animate-spin" />
            Opening…
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Real-time Log Viewer Component ── */
function LogViewer({ service, environment }: { service: string; environment: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tail, setTail] = useState('200');
  const [since, setSince] = useState('30m');
  const logsEndRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        tail,
        since,
        ...(searchQuery ? { grep: searchQuery } : {}),
      });
      const data = await apiJsonRequest<{ success: boolean; lines?: string[] }>(
        'GET',
        `/api/ops/logs/${service}?${params}`,
      );
      if (data.success) {
        setLines(data.lines || []);
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  }, [service, tail, since, searchQuery]);

  useEffect(() => {
    setLoading(true);
    fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  useEffect(() => {
    if (autoRefresh && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, autoRefresh]);

  const getLineColor = (line: string) => {
    if (/error|ERR|FAIL|fatal/i.test(line)) return 'text-red-600';
    if (/warn|WARN/i.test(line)) return 'text-amber-600';
    if (/debug|DEBUG/i.test(line)) return 'text-slate-400';
    return 'text-slate-700';
  };

  const exportLogs = () => {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${service}-logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Controls Bar */}
      <div className="flex items-center gap-3 p-4 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg">
          <Box className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">{service}</span>
          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]">
            {environment}
          </Badge>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-48 h-8 text-xs bg-slate-50 border-slate-200"
          />
          <Select value={since} onValueChange={setSince}>
            <SelectTrigger className="w-24 h-8 text-xs bg-slate-50 border-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5m">5 min</SelectItem>
              <SelectItem value="15m">15 min</SelectItem>
              <SelectItem value="30m">30 min</SelectItem>
              <SelectItem value="1h">1 hour</SelectItem>
              <SelectItem value="6h">6 hours</SelectItem>
              <SelectItem value="24h">24 hours</SelectItem>
            </SelectContent>
          </Select>
          <Select value={tail} onValueChange={setTail}>
            <SelectTrigger className="w-24 h-8 text-xs bg-slate-50 border-slate-200">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="50">50 lines</SelectItem>
              <SelectItem value="200">200 lines</SelectItem>
              <SelectItem value="500">500 lines</SelectItem>
              <SelectItem value="1000">1000 lines</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`h-8 text-xs ${autoRefresh ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : ''}`}
          >
            {autoRefresh ? <Play className="w-3 h-3 mr-1" /> : <Square className="w-3 h-3 mr-1" />}
            {autoRefresh ? 'Live' : 'Paused'}
          </Button>
          <Button variant="outline" size="sm" onClick={fetchLogs} className="h-8 text-xs">
            <RefreshCw className="w-3 h-3" />
          </Button>
          <Button variant="outline" size="sm" onClick={exportLogs} className="h-8 text-xs">
            <Download className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Log Output */}
      <div className="flex-1 overflow-y-auto bg-slate-50 font-mono text-xs p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32 text-slate-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Loading logs...
          </div>
        ) : lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-slate-400">
            <Terminal className="w-8 h-8 mb-2 opacity-40" />
            <p>No logs found for this service</p>
            <p className="text-[10px] mt-1">Try extending the time range or check if the container is running</p>
          </div>
        ) : (
          <div className="space-y-0">
            {lines.map((line, i) => (
              <div
                key={i}
                className={`py-0.5 leading-5 hover:bg-white/80 px-2 -mx-2 rounded ${getLineColor(line)}`}
              >
                <span className="text-slate-300 select-none mr-3">{String(i + 1).padStart(4, ' ')}</span>
                {line}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="flex items-center px-4 py-1.5 border-t border-slate-200 bg-white text-[11px] text-slate-500">
        <span>{lines.length} lines</span>
        <span className="mx-2">·</span>
        <span>Last {since}</span>
        {autoRefresh && (
          <>
            <span className="mx-2">·</span>
            <span className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Refreshing every 5s
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Main Component ── */
export default function OpsHub() {
  const { user, token, getToken } = useAuth();
  const { toast } = useToast();
  const [activePage, setActivePage] = useState('workstations');
  const [activeTopTab, setActiveTopTab] = useState('devops');
  const [platformOnline, setPlatformOnline] = useState(true);
  const [overview, setOverview] = useState<OpsOverview | null>(null);
  const [activeProject, setActiveProject] = useState<Project>(PROJECTS[0]);
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [codingAgentMode, setCodingAgentMode] = useState<CodingAgentRunMode>('agent');
  const [modelSelector, setModelSelector] = useState<CodingAgentModelSelector>('simple-edit');
  const [chatSending, setChatSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<OpsWorkspaceFileContext | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<CodingAgentProvider>('kimi');
  const [architectSteps, setArchitectSteps] = useState<ArchitectStep[]>([]);
  const [showArchitect, setShowArchitect] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [promptOptimizing, setPromptOptimizing] = useState(false);
  const [fileContextExpanded, setFileContextExpanded] = useState(false);
  const voiceRecognitionRef = useRef<any>(null);
  const [externalFileUpdate, setExternalFileUpdate] = useState<{
    path: string;
    content: string;
    modifiedAt?: string;
    token: number;
  } | null>(null);
  const [externalFileToken, setExternalFileToken] = useState(0);
  const [requestedFilePath, setRequestedFilePath] = useState<string | undefined>(undefined);
  const [requestedFileToken, setRequestedFileToken] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const authToken = token || getToken();
  const tokenPayload = parseOpsTokenPayload(authToken);
  const userRoles = Array.from(new Set([
    ...collectOpsRoles((user as { role?: unknown; roles?: unknown } | null)?.role),
    ...collectOpsRoles((user as { role?: unknown; roles?: unknown } | null)?.roles),
    ...collectOpsRoles(tokenPayload?.role),
    ...collectOpsRoles(tokenPayload?.roles),
  ]));
  const canManageSecrets = userRoles.includes('admin');
  const navSections = useMemo(
    () =>
      NAV_SECTIONS.map((section) => ({
        ...section,
        items: section.items.filter((item) => canManageSecrets || item.id !== 'secrets'),
      })).filter((section) => section.items.length > 0),
    [canManageSecrets],
  );

  useEffect(() => {
    // Guard: if no auth token, redirect to login immediately
    if (!authToken) {
      window.location.href = '/login';
      return;
    }

    const loadOverview = async () => {
      try {
        const data = await apiJsonRequest<{ success: boolean; overview: OpsOverview; error?: string }>(
          'GET',
          '/api/ops/overview',
        );
        if (!data.success) {
          throw new Error(data.error || 'Failed to load Ops Hub overview');
        }
        setOverview(data.overview);
      } catch (error) {
        // Don't toast session-expired — the redirect handles it
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('Session expired')) {
          toast({
            title: 'Ops Hub overview unavailable',
            description: msg,
            variant: 'destructive',
          });
        }
      }
    };

    const checkPlatform = async () => {
      try {
        const response = await fetch('/api/health', { signal: AbortSignal.timeout(5000) });
        setPlatformOnline(response.ok);
      } catch {
        setPlatformOnline(false);
      }
    };

    loadOverview();
    checkPlatform();
    const interval = setInterval(checkPlatform, 30000);
    return () => clearInterval(interval);
  }, [toast, authToken]);

  useEffect(() => {
    if (!canManageSecrets && activePage === 'secrets') {
      setActivePage('files');
      setActiveTopTab(getTopTabForPage('files'));
    }
  }, [activePage, canManageSecrets]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const goToPage = (pageId: string) => {
    setActivePage(pageId);
    setActiveTopTab(getTopTabForPage(pageId));
  };

  const goToTab = (tabId: string) => {
    setActiveTopTab(tabId);
    const sectionLabel = TAB_TO_SECTION[tabId];
    const section = navSections.find((entry) => entry.label === sectionLabel);
    if (section?.items.length) {
      setActivePage(section.items[0].id);
    }
  };

  const toggleSidePanel = () => {
    setSidePanelOpen((v) => !v);
  };

  /* ── Voice input ── */
  const toggleVoiceInput = useCallback(() => {
    if (voiceListening) {
      voiceRecognitionRef.current?.stop();
      setVoiceListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ title: 'Voice input unavailable', description: 'Your browser does not support Speech Recognition.', variant: 'destructive' });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    let finalTranscript = '';
    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setChatInput(finalTranscript + interim);
    };

    recognition.onerror = () => {
      setVoiceListening(false);
    };
    recognition.onend = () => {
      setVoiceListening(false);
    };

    voiceRecognitionRef.current = recognition;
    recognition.start();
    setVoiceListening(true);
  }, [voiceListening, toast]);

  /* ── Prompt optimization ── */
  const optimizePrompt = useCallback(async (rawPrompt: string): Promise<string> => {
    setPromptOptimizing(true);
    try {
      const data = await apiJsonRequest<{ success: boolean; optimizedPrompt?: string }>('POST', '/api/ops/coding-agent', {
        prompt: `Rewrite the following coding prompt to be more precise, technical, and actionable for a coding agent. Return ONLY the improved prompt text, nothing else.\n\nOriginal prompt: ${rawPrompt}`,
        mode: 'general',
        preferredProvider: 'kimi',
      }, { timeout: 60000 });
      if (data.success && data.optimizedPrompt) {
        return data.optimizedPrompt;
      }
      return rawPrompt;
    } catch {
      return rawPrompt;
    } finally {
      setPromptOptimizing(false);
    }
  }, []);

  /* ── Architect step progression ── */
  const advanceArchitectStep = useCallback((stepId: string, status: ArchitectStep['status'], detail?: string) => {
    setArchitectSteps((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, status, detail } : s)),
    );
  }, []);

  const handleChatSend = async (overridePrompt?: string) => {
    const rawPrompt = overridePrompt || chatInput.trim();
    if (!rawPrompt) return;
    const requestMode = codingAgentMode === 'plan' ? 'plan' : modelSelector;

    // Stop voice if active
    if (voiceListening) {
      voiceRecognitionRef.current?.stop();
      setVoiceListening(false);
    }

    const userMessage: ChatMessage = { role: 'user', content: rawPrompt, timestamp: new Date() };
    setChatMessages((current) => [...current, userMessage]);
    setChatInput('');
    setChatSending(true);

    // Show architect steps
    setShowArchitect(true);
    setArchitectSteps(INITIAL_ARCHITECT_STEPS.map((s) => ({ ...s, status: 'pending' as const })));

    try {
      // Step 1: Analyze
      advanceArchitectStep('analyze', 'active', `Scoping to ${activeProject.name}...`);
      await new Promise((r) => setTimeout(r, 300));
      advanceArchitectStep('analyze', 'done', selectedFile ? `Analyzed ${selectedFile.path} in ${activeProject.name}` : `Context ready — ${activeProject.name}`);

      // Step 2: Optimize prompt
      advanceArchitectStep('optimize', 'active', 'Improving prompt quality...');
      let prompt = rawPrompt;
      if (codingAgentMode === 'agent' && rawPrompt.length > 20) {
        prompt = await optimizePrompt(rawPrompt);
      }
      advanceArchitectStep('optimize', 'done', prompt !== rawPrompt ? 'Prompt optimized' : 'Prompt ready');

      // Step 3: Plan
      advanceArchitectStep('plan', 'active', `Routing to ${PROVIDER_ROUTING[selectedProvider]?.label || selectedProvider}...`);

      const isMultiEdit = codingAgentMode === 'agent' && modelSelector === 'multi-edit';
      const data = await apiJsonRequest<any>(
        'POST',
        '/api/ops/coding-agent',
        {
          prompt,
          mode: isMultiEdit ? 'multi-edit' : requestMode,
          selectedFilePath: selectedFile?.path,
          selectedFileContent: selectedFile?.dirty ? selectedFile.content : undefined,
          applyChanges: codingAgentMode === 'agent',
          preferredProvider: selectedProvider === 'agentx' ? undefined : selectedProvider,
          projectContext: {
            id: activeProject.id,
            name: activeProject.name,
            description: activeProject.description,
            environment: activeProject.environment,
            deployTarget: activeProject.deployTarget,
            services: activeProject.services.map((s) => ({ name: s.name, label: s.label })),
          },
        },
        { timeout: 180000 },
      );

      advanceArchitectStep('plan', 'done', 'Changes planned');

      if (!data.success) {
        advanceArchitectStep('apply', 'error', data.error || 'Failed');
        throw new Error(data.error || 'Failed to run coding agent');
      }

      // Step 4: Apply
      advanceArchitectStep('apply', 'active', 'Delivering result...');

      const fileEdits = data.response?.fileEdits as Array<{ path: string; content: string; isNew?: boolean }> | undefined;
      const editSummary = fileEdits?.length
        ? `\n\nFiles ${data.response?.applied ? 'applied' : 'proposed'}: ${fileEdits.map((f: any) => `${f.isNew ? '(new) ' : ''}${f.path}`).join(', ')}`
        : '';

      const nextMessage: ChatMessage = {
        role: 'assistant',
        content: (data.response?.summary || 'No response generated.') + editSummary,
        timestamp: new Date(),
        provider: data.response?.provider === 'system' ? undefined : data.response?.provider,
        model: data.response?.model,
        transport: data.response?.transport,
        applied: Boolean(data.response?.applied),
      };
      setChatMessages((current) => [...current, nextMessage]);

      advanceArchitectStep('apply', 'done', data.response?.applied ? 'Edits applied' : 'Response ready');

      // Handle single-file edit applied
      if (data.response?.applied && data.response?.path && typeof data.response?.updatedContent === 'string') {
        const nextToken = externalFileToken + 1;
        setExternalFileToken(nextToken);
        setExternalFileUpdate({
          path: data.response.path,
          content: data.response.updatedContent,
          modifiedAt: data.response.modifiedAt,
          token: nextToken,
        });
        setSelectedFile({
          path: data.response.path,
          content: data.response.updatedContent,
          modifiedAt: data.response.modifiedAt,
          dirty: false,
        });
        toast({ title: 'Edit applied', description: data.response.path });
      }

      // Handle multi-file edits applied
      if (data.response?.applied && fileEdits?.length) {
        for (const edit of fileEdits) {
          const nextToken = externalFileToken + 1;
          setExternalFileToken(nextToken);
          setExternalFileUpdate({
            path: edit.path,
            content: edit.content,
            token: nextToken,
          });
        }
        toast({ title: 'Multi-file edit applied', description: `${fileEdits.length} files updated` });
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      const isTimeout = errMsg.includes('timed out') || errMsg.includes('AbortError');
      advanceArchitectStep('apply', 'error', isTimeout ? 'Request timed out' : errMsg);
      setChatMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: isTimeout
            ? 'The AI service took too long to respond. This can happen with complex prompts or when the service is under heavy load. Click **Retry** to try again.'
            : `Error: ${errMsg}`,
          timestamp: new Date(),
          isError: true,
          retryPrompt: rawPrompt,
        },
      ]);
    } finally {
      setChatSending(false);
      // Collapse architect after brief delay
      setTimeout(() => setShowArchitect(false), 3000);
    }
  };

  const handleChatKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleChatSend();
    }
  };

  const secondaryNavSections = useMemo(
    () => SECONDARY_NAV_ORDER.map((label) => navSections.find((entry) => entry.label === label)).filter((section): section is NavSection => Boolean(section)),
    [navSections],
  );

  const handleDrawerFileSelect = useCallback((file: OpsWorkspaceFileContext) => {
    setSelectedFile(file);
  }, []);

  const handleOpenFileManager = useCallback((path?: string) => {
    if (path) {
      setRequestedFilePath(path);
      setRequestedFileToken((current) => current + 1);
    }
    goToPage('files');
  }, []);

  const renderContent = () => {
    switch (activePage) {
      case 'secrets':
        return canManageSecrets ? <IamSecrets /> : null;
      case 'logs':
        return (
          <LogViewer
            service={SERVICE_MAP[activeProject.id] || 'api'}
            environment={activeProject.environment}
          />
        );
      case 'vm-logs':
        return (
          <React.Suspense fallback={<div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>}>
            <CloudLogsMonitor />
          </React.Suspense>
        );
      case 'costs':
        return <CostsTab />;
      case 'workstations':
        return <WorkstationsTab />;
      case 'deployments':
        return <DeploymentsTab project={activeProject} />;
      case 'domains':
        return <DomainsTab />;
      case 'agents':
        return <AgentsTab />;
      case 'files':
        return (
          <FileManagerTab
            onFileContextChange={setSelectedFile}
            externalFileUpdate={externalFileUpdate}
            requestedFilePath={requestedFilePath}
            requestedFileToken={requestedFileToken}
          />
        );
      case 'preview':
        return <PreviewTab />;
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full text-white/30">
            <Code2 className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Select a section to get started</p>
          </div>
        );
    }
  };

  const statusColor = activeProject.status === 'running'
    ? 'bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/50'
    : activeProject.status === 'deploying'
    ? 'bg-amber-400 animate-pulse shadow-[0_0_6px] shadow-amber-400/50'
    : 'bg-slate-500';

  return (
    <div className="h-screen flex flex-col bg-[#0a0e1a] text-slate-100 overflow-hidden font-sans">
      {/* ── Header ── */}
      <header className="h-12 border-b border-white/[0.06] bg-[#0d1117]/90 backdrop-blur-xl flex items-center px-4 shrink-0 z-50 shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
        {/* Logo */}
        <div className="flex items-center gap-2.5 mr-5">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-bold text-white tracking-tight">Ops Hub</span>
        </div>

        {/* Separator */}
        <div className="h-5 w-px bg-white/10 mr-4" />

        {/* Project Switcher */}
        <div className="relative mr-5">
          <button
            onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors text-sm border border-transparent hover:border-white/10"
          >
            <div className={`w-2 h-2 rounded-full ${statusColor} shadow-[0_0_6px] ${activeProject.status === 'running' ? 'shadow-emerald-400/50' : ''}`} />
            <span className="font-medium text-white/90">{activeProject.name}</span>
            <span className="text-[10px] text-white/40 uppercase font-medium">{activeProject.environment}</span>
            <ChevronDown className="w-3.5 h-3.5 text-white/40" />
          </button>

          {projectDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setProjectDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-1 w-72 bg-[#161b26] border border-white/10 rounded-xl shadow-2xl shadow-black/50 z-50 py-1 backdrop-blur-xl">
                <div className="px-3 py-2">
                  <span className="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Projects</span>
                </div>
                {PROJECTS.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => {
                      setActiveProject(project);
                      setProjectDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/5 transition-colors ${
                      activeProject.id === project.id ? 'bg-white/5' : ''
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      project.status === 'running' ? 'bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/50' : project.status === 'deploying' ? 'bg-amber-400 animate-pulse' : 'bg-slate-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-white/90 truncate">{project.name}</div>
                      <div className="text-xs text-white/40 truncate">{project.description}</div>
                    </div>
                    <span className={`text-[10px] font-medium uppercase px-1.5 py-0.5 rounded ${
                      project.deployTarget === 'cloud-run'
                        ? 'bg-blue-500/10 text-blue-400'
                        : 'bg-white/5 text-white/50'
                    }`}>
                      {project.deployTarget === 'cloud-run' ? 'Cloud Run' : 'VM'}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Top Tabs */}
        <nav className="flex items-center gap-0.5">
          {TOP_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => goToTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg transition-all duration-200 ${
                activeTopTab === tab.id
                  ? 'text-white bg-white/10 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]'
                  : 'text-white/50 hover:text-white/80 hover:bg-white/5'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={toggleSidePanel}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all duration-200 ${
              sidePanelOpen
                ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white shadow-lg shadow-indigo-500/25'
                : 'text-white/50 hover:bg-white/5 hover:text-white/80'
            }`}
          >
            <Brain className="h-3.5 w-3.5" />
            Agent C
          </button>
          <div className="h-5 w-px bg-white/10" />
          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center cursor-pointer hover:bg-white/15 transition-colors ring-1 ring-white/5">
            <User className="w-3.5 h-3.5 text-white/70" />
          </div>
        </div>
      </header>

      {/* ── Secondary Navigation ── */}
      <div className="shrink-0 border-b border-white/[0.06] bg-[#0d1117]/80 backdrop-blur-sm px-4">
        <div className="flex items-center gap-0 overflow-x-auto -mb-px">
          {secondaryNavSections.map((section) =>
            section.items.map((item) => (
              <button
                key={item.id}
                onClick={() => goToPage(item.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-[13px] font-medium border-b-2 transition-all duration-200 ${
                  activePage === item.id
                    ? 'border-indigo-400 text-white'
                    : 'border-transparent text-white/40 hover:text-white/70 hover:border-white/20'
                }`}
              >
                <span className={activePage === item.id ? 'text-indigo-400' : 'text-white/30'}>{item.icon}</span>
                {item.label}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-[#0f1420]">
          {activePage === 'logs' || activePage === 'vm-logs' ? (
            renderContent()
          ) : (
            <div className={activePage === 'workstations' ? 'flex-1 min-h-0 overflow-hidden p-5' : 'flex-1 overflow-y-auto p-5'}>
              {renderContent()}
            </div>
          )}
        </main>

        {sidePanelOpen && (
          <aside className="flex h-full w-[400px] shrink-0 flex-col border-l border-white/[0.06] bg-[#0d1117]">
            {/* ── Panel Header ── */}
            <div className="border-b border-white/[0.06] px-4 py-3 bg-[#0d1117]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/20">
                    <Code2 className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white">Agent C</p>
                    <p className="text-[11px] text-white/40">{activeProject.name}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidePanelOpen(false)}
                  className="h-7 w-7 rounded-md p-0 text-white/40 hover:bg-white/5 hover:text-white/70"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Mode & Provider Controls */}
              <div className="mt-2.5 flex items-center gap-1.5">
                <div className="flex items-center rounded-lg bg-white/5 p-0.5 ring-1 ring-white/[0.06]">
                  <button
                    onClick={() => setCodingAgentMode('agent')}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-200 ${
                      codingAgentMode === 'agent'
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    Agent
                  </button>
                  <button
                    onClick={() => setCodingAgentMode('plan')}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-all duration-200 ${
                      codingAgentMode === 'plan'
                        ? 'bg-white/10 text-white shadow-sm'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    Plan
                  </button>
                </div>

                {codingAgentMode === 'agent' && (
                  <Select
                    value={modelSelector}
                    onValueChange={(value) => setModelSelector(value as CodingAgentModelSelector)}
                  >
                    <SelectTrigger className="h-7 w-[90px] rounded-lg border-white/10 bg-white/5 px-2 text-[11px] text-white/70">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple-edit">Patch</SelectItem>
                      <SelectItem value="multi-edit">Multi-File</SelectItem>
                    </SelectContent>
                  </Select>
                )}

                <Select
                  value={selectedProvider}
                  onValueChange={(value) => setSelectedProvider(value as CodingAgentProvider)}
                >
                  <SelectTrigger className="h-7 w-[100px] rounded-lg border-white/10 bg-white/5 px-2 text-[11px] text-white/70">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROVIDER_ROUTING).map(([key, info]) => (
                      <SelectItem key={key} value={key}>
                        <span className="flex items-center gap-2">
                          <span className={`h-1.5 w-1.5 rounded-full ${info.color}`} />
                          {info.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* ── Collapsible File Context ── */}
            {selectedFile && (
              <div className="border-b border-white/[0.06]">
                <button
                  onClick={() => setFileContextExpanded(!fileContextExpanded)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left transition hover:bg-white/[0.03]"
                >
                  <FileText className="h-3.5 w-3.5 text-white/30" />
                  <span className="flex-1 truncate text-[11px] font-medium text-white/60">{selectedFile.path}</span>
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px]">active</Badge>
                  <ChevronDown className={`h-3.5 w-3.5 text-white/30 transition ${fileContextExpanded ? 'rotate-180' : ''}`} />
                </button>
                {fileContextExpanded && (
                  <div className="px-4 pb-3">
                    <div className="flex items-center gap-2 text-[10px] text-white/30 mb-2">
                      <span>{formatWorkspaceTimestamp(selectedFile.modifiedAt)}</span>
                      <span>·</span>
                      <span>{formatWorkspaceBytes(selectedFile.content.length)}</span>
                      <button
                        onClick={() => setSelectedFile(null)}
                        className="ml-auto text-[10px] text-red-400 hover:text-red-300"
                      >
                        Clear
                      </button>
                    </div>
                    <pre className="max-h-24 overflow-y-auto rounded-lg bg-black/40 ring-1 ring-white/[0.06] px-3 py-2 text-[10px] leading-relaxed text-emerald-300/80">
                      {selectedFile.content.slice(0, 400) || 'Empty file'}
                    </pre>
                  </div>
                )}
              </div>
            )}

            {/* ── Architect Pipeline View ── */}
            {showArchitect && architectSteps.length > 0 && (
              <div className="border-b border-white/[0.06] bg-white/[0.02] px-4 py-2.5">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <Wand2 className="h-3 w-3 text-indigo-400" />
                  <span className="text-[11px] font-medium text-white/60">Pipeline</span>
                </div>
                <div className="space-y-1.5">
                  {architectSteps.map((step, i) => (
                    <div key={step.id} className="flex items-center gap-2">
                      {step.status === 'pending' && <CircleDot className="h-3.5 w-3.5 text-white/20" />}
                      {step.status === 'active' && <Loader2 className="h-3.5 w-3.5 text-indigo-400 animate-spin" />}
                      {step.status === 'done' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />}
                      {step.status === 'error' && <X className="h-3.5 w-3.5 text-red-400" />}
                      <div className="flex-1 min-w-0">
                        <span className={`text-[11px] font-medium ${
                          step.status === 'active' ? 'text-indigo-300' :
                          step.status === 'done' ? 'text-emerald-300' :
                          step.status === 'error' ? 'text-red-300' :
                          'text-white/20'
                        }`}>
                          {step.label}
                        </span>
                        {step.detail && (
                          <span className="ml-2 text-[10px] text-white/30">{step.detail}</span>
                        )}
                      </div>
                      {i < architectSteps.length - 1 && step.status === 'done' && (
                        <ArrowRight className="h-3 w-3 text-white/20" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Chat Messages ── */}
            <div className="flex-1 overflow-y-auto bg-[#0a0e1a] px-4 py-4">
              {chatMessages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center px-4">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/20 to-violet-500/10 ring-1 ring-indigo-500/20">
                    <Brain className="h-5 w-5 text-indigo-400" />
                  </div>
                  <p className="text-sm font-medium text-white/90">What would you like to build?</p>
                  <p className="mt-1.5 max-w-[260px] text-xs text-white/40 leading-relaxed">
                    Agent C is scoped to <strong className="text-white/60">{activeProject.name}</strong>. Select a file in the workspace, then ask for edits, analysis, or planning.
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-1.5 w-full max-w-[280px]">
                    {[
                      { label: 'Analyze code', prompt: `Analyze the key files in the ${activeProject.name} project for issues and improvements.` },
                      { label: 'Fix a bug', prompt: selectedFile ? 'Fix a bug in the currently selected file.' : `Help me debug an issue in the ${activeProject.name} project.` },
                      { label: 'Refactor', prompt: selectedFile ? 'Refactor the selected file for clarity and maintainability.' : `Suggest refactoring targets in ${activeProject.name}.` },
                      { label: 'Plan feature', prompt: `Plan a new feature for the ${activeProject.name} project and explain the implementation steps.` },
                    ].map((action) => (
                      <button
                        key={action.label}
                        onClick={() => setChatInput(action.prompt)}
                        className="rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-2 text-[11px] font-medium text-white/60 transition-all hover:border-white/15 hover:bg-white/[0.06] hover:text-white/90 text-left"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => goToPage('files')}
                    className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-white/30 transition hover:text-white/60"
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Open workspace
                  </button>
                </div>
              ) : (
                chatMessages.map((message, index) => {
                  const providerLabel =
                    message.provider && message.provider in AGENT_PROVIDER_LABELS
                      ? AGENT_PROVIDER_LABELS[message.provider as CodingAgentProvider]
                      : message.provider;

                  return (
                    <div key={`${message.timestamp.toISOString()}-${index}`} className={`mb-3 ${message.role === 'user' ? 'flex justify-end' : ''}`}>
                      <div className={`max-w-[90%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                        message.role === 'user'
                          ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-500/20'
                          : message.isError
                          ? 'border border-red-500/20 bg-red-500/10 text-red-300'
                          : 'border border-white/[0.08] bg-white/[0.04] text-white/80'
                      }`}>
                        <p className="whitespace-pre-wrap">{message.content}</p>
                        <div className="mt-2 flex items-center gap-2 text-[10px] opacity-60">
                          {providerLabel && <span>via {providerLabel}</span>}
                          {message.model && <span>{message.model}</span>}
                          {message.transport && <span>{message.transport}</span>}
                          {message.applied && (
                            <span className="inline-flex items-center gap-1 font-medium text-emerald-500">
                              <CheckCircle2 className="h-3 w-3" />
                              edit applied
                            </span>
                          )}
                        </div>
                        {message.isError && message.retryPrompt && (
                          <button
                            onClick={() => handleChatSend(message.retryPrompt!)}
                            disabled={chatSending}
                            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-1.5 text-[11px] font-medium text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
                          >
                            <RefreshCw className="h-3 w-3" />
                            Retry
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* ── Input Area ── */}
            <div className="border-t border-white/[0.06] bg-[#0d1117] px-3 py-2.5">
              {promptOptimizing && (
                <div className="mb-2 flex items-center gap-1.5 rounded-lg bg-indigo-500/10 ring-1 ring-indigo-500/20 px-2.5 py-1.5 text-[11px] text-indigo-300">
                  <Sparkles className="h-3 w-3 animate-pulse text-indigo-400" />
                  Optimizing prompt...
                </div>
              )}
              <div className="relative">
                <Textarea
                  value={chatInput}
                  onChange={(event) => setChatInput(event.target.value)}
                  onKeyDown={handleChatKeyDown}
                  placeholder={voiceListening ? 'Listening...' : 'Describe what you need...'}
                  className={`min-h-[64px] max-h-[120px] resize-none rounded-xl border-white/[0.08] bg-white/[0.03] pr-20 text-[13px] text-white/90 placeholder:text-white/25 focus:border-indigo-500/40 focus:ring-1 focus:ring-indigo-500/20 ${
                    voiceListening ? 'border-red-500/30 bg-red-500/5' : ''
                  }`}
                  rows={2}
                />
                <div className="absolute bottom-2 right-2 flex items-center gap-1">
                  <button
                    onClick={toggleVoiceInput}
                    className={`rounded-lg p-1.5 transition-all ${
                      voiceListening
                        ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30'
                        : 'text-white/30 hover:text-white/60 hover:bg-white/5'
                    }`}
                    title={voiceListening ? 'Stop listening' : 'Voice input'}
                  >
                    {voiceListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => handleChatSend()}
                    disabled={chatSending || !chatInput.trim()}
                    className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 p-1.5 transition-all hover:from-indigo-400 hover:to-violet-400 disabled:opacity-20 shadow-lg shadow-indigo-500/20"
                  >
                    {chatSending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                    ) : (
                      <Send className="h-3.5 w-3.5 text-white" />
                    )}
                  </button>
                </div>
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[10px] text-white/25">
                <span>Enter to send</span>
                <span className="flex items-center gap-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${PROVIDER_ROUTING[selectedProvider]?.color || 'bg-white/30'}`} />
                  {PROVIDER_ROUTING[selectedProvider]?.label || selectedProvider}
                </span>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="h-7 border-t border-white/[0.06] bg-[#0d1117]/90 backdrop-blur-sm flex items-center px-4 shrink-0 text-[10px] text-white/30">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${platformOnline ? 'bg-emerald-400 shadow-[0_0_6px] shadow-emerald-400/50' : 'bg-red-400 shadow-[0_0_6px] shadow-red-400/50'}`} />
          <span>{platformOnline ? 'Online' : 'Offline'}</span>
        </div>
        {overview?.currentBranch && (
          <span className="ml-3 truncate flex items-center gap-1">
            <GitBranch className="h-3 w-3" />
            {overview.currentBranch}{overview.currentCommit ? ` · ${overview.currentCommit.slice(0, 7)}` : ''}
          </span>
        )}
        <span className="ml-auto">{activeProject.deployTarget === 'vm' ? 'VM' : 'Cloud Run'} · {activeProject.environment}</span>
      </footer>
    </div>
  );
}
