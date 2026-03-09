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

type CodingAgentProvider = 'agentx' | 'codex' | 'claude' | 'gemini';
type CodingAgentRunMode = 'agent' | 'plan';
type CodingAgentModelSelector = 'simple-edit';
type SidePanelTab = 'files' | 'manager';

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
      { name: 'demandgentic-api', label: 'API (Cloud Run)', cloudRunService: 'demandgentic-api', imageUrl: 'gcr.io/gen-lang-client-0789558283/demandgentic-api:latest' },
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
  agentx: 'AgentX',
  codex: 'Codex',
  claude: 'Claude',
  gemini: 'Gemini',
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
              Pick a file here, then switch to <strong>AgentX</strong> for an edit request or jump into the full editor.
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
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab>('manager');

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [codingAgentMode, setCodingAgentMode] = useState<CodingAgentRunMode>('agent');
  const [modelSelector, setModelSelector] = useState<CodingAgentModelSelector>('simple-edit');
  const [chatSending, setChatSending] = useState(false);
  const [selectedFile, setSelectedFile] = useState<OpsWorkspaceFileContext | null>(null);
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

  const openSidePanel = (tab: SidePanelTab) => {
    setSidePanelTab(tab);
    setSidePanelOpen(true);
  };

  const handleChatSend = async () => {
    const prompt = chatInput.trim();
    if (!prompt) return;
    const requestMode = codingAgentMode === 'plan' ? 'plan' : modelSelector;

    const userMessage: ChatMessage = { role: 'user', content: prompt, timestamp: new Date() };
    setChatMessages((current) => [...current, userMessage]);
    setChatInput('');
    setChatSending(true);

    try {
      const data = await apiJsonRequest<any>(
        'POST',
        '/api/ops/coding-agent',
        {
          prompt,
          mode: requestMode,
          selectedFilePath: selectedFile?.path,
          selectedFileContent: selectedFile?.dirty ? selectedFile.content : undefined,
          applyChanges: codingAgentMode === 'agent' && modelSelector === 'simple-edit',
        },
      );

      if (!data.success) {
        throw new Error(data.error || 'Failed to run coding agent');
      }

      const nextMessage: ChatMessage = {
        role: 'assistant',
        content: data.response?.summary || 'No response generated.',
        timestamp: new Date(),
        provider: data.response?.provider === 'system' ? undefined : data.response?.provider,
        model: data.response?.model,
        transport: data.response?.transport,
        applied: Boolean(data.response?.applied),
      };
      setChatMessages((current) => [...current, nextMessage]);

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
    } catch (error) {
      setChatMessages((current) => [
        ...current,
        { role: 'assistant', content: `Error: ${error instanceof Error ? error.message : String(error)}`, timestamp: new Date() },
      ]);
    } finally {
      setChatSending(false);
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
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <Code2 className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-medium">Select a section to get started</p>
          </div>
        );
    }
  };

  const statusColor = activeProject.status === 'running'
    ? 'bg-emerald-400'
    : activeProject.status === 'deploying'
    ? 'bg-amber-400 animate-pulse'
    : 'bg-slate-300';

  return (
    <div className="h-screen flex flex-col bg-white text-slate-900 overflow-hidden font-sans">
      {/* ── Header ── */}
      <header className="h-[56px] border-b border-slate-200 bg-white flex items-center px-5 shrink-0 z-50 shadow-sm">
        {/* Logo */}
        <div className="flex items-center gap-3 mr-6">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Zap className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <span className="text-[15px] font-bold text-slate-900 tracking-tight">
              Operations Hub
            </span>
          </div>
        </div>

        {/* Project Switcher */}
        <div className="relative mr-6">
          <button
            onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-slate-100 transition-colors border border-slate-200"
          >
            <span className="text-lg">{activeProject.icon}</span>
            <div className="text-left">
              <div className="text-sm font-semibold text-slate-800">{activeProject.name}</div>
              <div className="text-[10px] text-slate-500">{activeProject.environment}</div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 ml-1" />
          </button>

          {projectDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setProjectDropdownOpen(false)} />
              <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-2">
                <div className="px-3 py-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Projects</span>
                </div>
                {PROJECTS.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => {
                      setActiveProject(project);
                      setProjectDropdownOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 transition-colors ${
                      activeProject.id === project.id ? 'bg-indigo-50' : ''
                    }`}
                  >
                    <span className="text-xl">{project.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-800 truncate">{project.name}</div>
                      <div className="text-xs text-slate-500 truncate">{project.description}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${
                          project.status === 'running' ? 'bg-emerald-400' : project.status === 'deploying' ? 'bg-amber-400 animate-pulse' : 'bg-slate-300'
                        }`} />
                        <span className="text-[10px] text-slate-500 capitalize">{project.status}</span>
                      </div>
                      <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                        project.deployTarget === 'cloud-run'
                          ? 'bg-blue-100 text-blue-600'
                          : 'bg-indigo-100 text-indigo-600'
                      }`}>
                        {project.deployTarget === 'cloud-run' ? 'Cloud Run' : 'VM'}
                      </span>
                    </div>
                  </button>
                ))}
                <div className="border-t border-slate-100 mt-1 pt-1">
                  <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 transition-colors">
                    <Plus className="w-4 h-4" />
                    Add Project
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Top Tabs */}
        <nav className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          {TOP_TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => goToTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-medium rounded-md transition-all duration-200 ${
                activeTopTab === tab.id
                  ? 'text-slate-900 bg-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Right side */}
        <div className="ml-auto flex items-center gap-1.5">
          <Badge className={`${statusColor.replace('bg-', 'bg-').replace('-400', '-100')} text-xs px-2.5 py-0.5 rounded-full border-0`}>
            <div className={`w-1.5 h-1.5 rounded-full ${statusColor} mr-1.5`} />
            <span className={statusColor.includes('emerald') ? 'text-emerald-700' : statusColor.includes('amber') ? 'text-amber-700' : 'text-slate-600'}>
              {activeProject.status === 'running' ? 'Online' : activeProject.status === 'deploying' ? 'Deploying' : 'Offline'}
            </span>
          </Badge>
          <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all">
            <Search className="w-4 h-4" />
          </button>
          <button className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all relative">
            <Bell className="w-4 h-4" />
            <div className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full" />
          </button>
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center ml-1 shadow-sm cursor-pointer">
            <User className="w-4 h-4 text-white" />
          </div>
        </div>
      </header>

      <div className="shrink-0 border-b border-slate-200 bg-slate-50/70 px-5 py-3">
        <div className="flex items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {secondaryNavSections.map((section, sectionIndex) => (
                <React.Fragment key={section.label}>
                  {sectionIndex > 0 && <div className="mx-1 h-6 w-px shrink-0 bg-slate-200" />}
                  {section.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => goToPage(item.id)}
                      className={`inline-flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                        activePage === item.id
                          ? 'border-indigo-200 bg-white text-indigo-600 shadow-sm'
                          : 'border-transparent bg-transparent text-slate-500 hover:border-slate-200 hover:bg-white hover:text-slate-700'
                      }`}
                    >
                      <span className={activePage === item.id ? 'text-indigo-500' : 'text-slate-400'}>{item.icon}</span>
                      <span>{item.label}</span>
                    </button>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 border-l border-slate-200 pl-4">
            <button
              onClick={() => openSidePanel('files')}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                sidePanelOpen && sidePanelTab === 'files'
                  ? 'border-indigo-200 bg-white text-indigo-600 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
              }`}
            >
              <FolderOpen className="h-4 w-4" />
              Files
            </button>
            <button
              onClick={() => openSidePanel('manager')}
              className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-all ${
                sidePanelOpen && sidePanelTab === 'manager'
                  ? 'border-indigo-200 bg-white text-indigo-600 shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
              }`}
            >
              <Bot className="h-4 w-4" />
              AgentX
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-white">
          {activePage === 'logs' || activePage === 'vm-logs' ? (
            renderContent()
          ) : (
            <div className={activePage === 'workstations' ? 'flex-1 min-h-0 overflow-hidden p-6' : 'flex-1 overflow-y-auto p-6'}>
              {renderContent()}
            </div>
          )}
        </main>

        {sidePanelOpen && (
          <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center gap-1 rounded-xl bg-slate-100 p-1">
                  <button
                    onClick={() => setSidePanelTab('files')}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                      sidePanelTab === 'files'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <FolderOpen className="h-4 w-4" />
                    Files
                  </button>
                  <button
                    onClick={() => setSidePanelTab('manager')}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                      sidePanelTab === 'manager'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    <Bot className="h-4 w-4" />
                    AgentX
                  </button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSidePanelOpen(false)}
                  className="h-9 w-9 rounded-xl p-0 text-slate-500 hover:bg-slate-100"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-hidden">
              {sidePanelTab === 'files' ? (
                <FileSearchDrawerPanel
                  selectedFile={selectedFile}
                  onSelectFile={handleDrawerFileSelect}
                  onOpenInEditor={handleOpenFileManager}
                />
              ) : (
                <div className="flex h-full min-h-0 flex-col bg-white">
                  <div className="border-b border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#fbfaf6_100%)] px-4 py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 shadow-sm">
                          <Code2 className="h-4.5 w-4.5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">AgentX - The Architect</p>
                          <p className="text-[11px] text-slate-500">Clean coding edits and fast planning</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1">
                        <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-emerald-700">Ready</span>
                      </div>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex items-center gap-1 rounded-full bg-slate-100 p-0.5">
                        <button
                          onClick={() => setCodingAgentMode('agent')}
                          className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${
                            codingAgentMode === 'agent'
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          Agent
                        </button>
                        <button
                          onClick={() => setCodingAgentMode('plan')}
                          className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${
                            codingAgentMode === 'plan'
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          Plan
                        </button>
                      </div>

                      <Select
                        value={modelSelector}
                        onValueChange={(value) => setModelSelector(value as CodingAgentModelSelector)}
                      >
                        <SelectTrigger className="h-8 w-[112px] rounded-full border-slate-200 bg-slate-50 px-3 text-[11px] text-slate-700">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="simple-edit">Patch</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {selectedFile && (
                      <div className="mt-2 flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50/90 px-3 py-1.5">
                        <FileText className="h-3.5 w-3.5 text-slate-400" />
                        <p className="truncate text-[11px] font-medium text-slate-600">{selectedFile.path}</p>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto bg-slate-50/60 px-4 py-4">
                    {chatMessages.length === 0 ? (
                      <div className="flex h-full flex-col items-center justify-center text-center">
                        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl border border-slate-200 bg-white">
                          <Code2 className="h-7 w-7 text-slate-500" />
                        </div>
                        <p className="text-sm font-medium text-slate-800">AgentX - The Architect</p>
                        <p className="mt-2 max-w-xs text-[13px] text-slate-500">
                          Ask for a fix, refactor, or a quick implementation plan. Open a file first to let AgentX apply edits directly.
                        </p>

                        <div className="mt-5 flex flex-wrap justify-center gap-2">
                          {[
                            { label: 'Fix a bug', prompt: 'Fix a bug in the currently selected file.' },
                            { label: 'Refactor code', prompt: 'Refactor the selected file for clarity and maintainability.' },
                            { label: 'Add feature', prompt: 'Add a feature to the selected file and explain the implementation.' },
                            { label: 'Write tests', prompt: 'Write tests that cover the selected functionality.' },
                          ].map((action) => (
                            <button
                              key={action.label}
                              onClick={() => setChatInput(action.prompt)}
                              className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900"
                            >
                              {action.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      chatMessages.map((message, index) => {
                        const providerLabel =
                          message.provider && message.provider in AGENT_PROVIDER_LABELS
                            ? AGENT_PROVIDER_LABELS[message.provider as CodingAgentProvider]
                            : message.provider;

                        return (
                          <div key={`${message.timestamp.toISOString()}-${index}`} className={`mb-4 ${message.role === 'user' ? 'flex justify-end' : ''}`}>
                            <div className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-relaxed ${
                              message.role === 'user'
                                ? 'bg-indigo-500 text-white shadow-sm'
                                : 'border border-slate-200 bg-white text-slate-700 shadow-sm'
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
                            </div>
                          </div>
                        );
                      })
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <div className="border-t border-slate-200 bg-white px-3.5 py-3">
                    <div className="relative">
                      <Textarea
                        value={chatInput}
                        onChange={(event) => setChatInput(event.target.value)}
                        onKeyDown={handleChatKeyDown}
                        placeholder="Ask AgentX for a fix, refactor, or plan..."
                        className="min-h-[72px] max-h-[140px] resize-none rounded-2xl border-slate-200 bg-slate-50 pr-11 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-slate-300 focus:ring-slate-200"
                        rows={3}
                      />
                      <button
                        onClick={handleChatSend}
                        disabled={chatSending || !chatInput.trim()}
                        className="absolute bottom-2.5 right-2.5 rounded-xl bg-slate-900 p-2 shadow-sm transition-all hover:bg-slate-800 disabled:opacity-30"
                      >
                        {chatSending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-white" />
                        ) : (
                          <Send className="h-3.5 w-3.5 text-white" />
                        )}
                      </button>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-400">Enter sends. Shift+Enter adds a new line.</p>
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="h-8 border-t border-slate-200 bg-white flex items-center px-5 shrink-0 text-[11px]">
        <span className="text-slate-400 font-medium">v1.0.5-stable</span>
        <div className="ml-5 flex items-center gap-2 bg-slate-100 px-2.5 py-0.5 rounded-full">
          <div className={`w-[6px] h-[6px] rounded-full ${platformOnline ? 'bg-emerald-400' : 'bg-red-400'}`} />
          <span className={`font-medium ${platformOnline ? 'text-emerald-600' : 'text-red-600'}`}>
            {platformOnline ? 'Platform Online' : 'Platform Offline'}
          </span>
        </div>
        {overview?.currentBranch && (
          <div className="ml-3 text-slate-400 font-medium truncate">
            {overview.currentBranch}{overview.currentCommit ? ` @ ${overview.currentCommit}` : ''}
          </div>
        )}
        <div className="ml-auto text-slate-400 font-medium">
          {activeProject.name} · {activeProject.environment}
        </div>
      </footer>
    </div>
  );
}
