import React, { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { apiJsonRequest } from '@/lib/queryClient';
import {
  Plus,
  Play,
  Square,
  Trash2,
  RefreshCw,
  Loader2,
  Monitor,
  Server,
  Settings,
  Cpu,
  HardDrive,
  Clock,
  ChevronRight,
  ChevronDown,
  X,
  Cloud,
  ArrowLeft,
  FolderOpen,
  File,
  FileCode2,
  FolderUp,
  Save,
  Terminal,
  Maximize2,
  Minimize2,
  CornerDownLeft,
  Plug,
} from 'lucide-react';

/* ── Types ── */
interface Cluster {
  id: string;
  name: string;
  displayName: string;
  network: string;
  subnetwork: string;
  controlPlaneIp: string;
  state: string;
  createTime: string;
  degraded: boolean;
}

interface Config {
  id: string;
  name: string;
  displayName: string;
  clusterId: string;
  machineType: string;
  bootDiskSizeGb: number;
  idleTimeout: string;
  runningTimeout: string;
  containerImage: string | null;
  state: string;
  createTime: string;
  degraded: boolean;
}

interface Workstation {
  id: string;
  name: string;
  displayName: string;
  configId: string;
  clusterId: string;
  state: 'STATE_UNSPECIFIED' | 'STATE_STARTING' | 'STATE_RUNNING' | 'STATE_STOPPING' | 'STATE_STOPPED';
  host: string;
  createTime: string;
  startTime: string;
  reconciling: boolean;
  env: Record<string, string>;
}

interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  permissions: string;
}

interface TerminalLine {
  id: number;
  type: 'input' | 'output' | 'error' | 'system';
  text: string;
  timestamp: Date;
}

type ViewMode = 'manager' | 'ide';
type CreateMode = 'cluster' | 'config' | 'workstation' | null;

/* ── Constants ── */
const STATE_COLORS: Record<string, string> = {
  STATE_RUNNING: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  STATE_STARTING: 'bg-amber-100 text-amber-700 border-amber-200',
  STATE_STOPPING: 'bg-orange-100 text-orange-700 border-orange-200',
  STATE_STOPPED: 'bg-slate-100 text-slate-600 border-slate-200',
  STATE_UNSPECIFIED: 'bg-slate-100 text-slate-500 border-slate-200',
  READY: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  RECONCILING: 'bg-amber-100 text-amber-700 border-amber-200',
  DEGRADED: 'bg-red-100 text-red-700 border-red-200',
};

const STATE_LABELS: Record<string, string> = {
  STATE_RUNNING: 'Running',
  STATE_STARTING: 'Starting',
  STATE_STOPPING: 'Stopping',
  STATE_STOPPED: 'Stopped',
  STATE_UNSPECIFIED: 'Unknown',
  READY: 'Ready',
  RECONCILING: 'Reconciling',
  DEGRADED: 'Degraded',
};

const MACHINE_TYPES = [
  { value: 'e2-standard-4', label: 'e2-standard-4 (4 vCPU, 16 GB)' },
  { value: 'e2-standard-8', label: 'e2-standard-8 (8 vCPU, 32 GB)' },
  { value: 'e2-standard-16', label: 'e2-standard-16 (16 vCPU, 64 GB)' },
  { value: 'n2-standard-4', label: 'n2-standard-4 (4 vCPU, 16 GB)' },
  { value: 'n2-standard-8', label: 'n2-standard-8 (8 vCPU, 32 GB)' },
  { value: 'n1-standard-4', label: 'n1-standard-4 (4 vCPU, 15 GB)' },
];

const EXT_LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  json: 'json', yaml: 'yaml', yml: 'yaml', md: 'markdown',
  py: 'python', go: 'go', rs: 'rust', sql: 'sql',
  html: 'html', css: 'css', scss: 'scss', sh: 'shell', bash: 'shell',
  dockerfile: 'dockerfile', xml: 'xml', toml: 'ini', env: 'ini',
};

function inferLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const base = filename.toLowerCase();
  if (base === 'dockerfile') return 'dockerfile';
  if (base === 'makefile') return 'makefile';
  if (base.endsWith('.env') || base.startsWith('.env')) return 'ini';
  return EXT_LANG_MAP[ext] || 'plaintext';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string) {
  if (!iso) return '\u2014';
  const d = new Date(iso);
  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getFileIcon(entry: FileEntry) {
  if (entry.type === 'directory') return <FolderOpen className="w-4 h-4 text-amber-500" />;
  const ext = entry.name.split('.').pop()?.toLowerCase();
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs'].includes(ext || ''))
    return <FileCode2 className="w-4 h-4 text-blue-500" />;
  return <File className="w-4 h-4 text-slate-400" />;
}

/* ── Helper: workstation API base path ── */
function wsApi(ws: Workstation) {
  return `/api/ops/workstations/clusters/${ws.clusterId}/configs/${ws.configId}/workstations/${ws.id}`;
}

/* ── StateBadge ── */
function StateBadge({ state }: { state: string }) {
  const spinning = state === 'STATE_STARTING' || state === 'STATE_STOPPING' || state === 'RECONCILING';
  return (
    <Badge className={`text-[10px] px-2 py-0.5 border ${STATE_COLORS[state] || STATE_COLORS.STATE_UNSPECIFIED}`}>
      {spinning ? (
        <Loader2 className="w-3 h-3 mr-1 animate-spin" />
      ) : (
        <div className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
          state === 'STATE_RUNNING' || state === 'READY' ? 'bg-emerald-500' :
          state === 'STATE_STOPPED' ? 'bg-slate-400' :
          state === 'DEGRADED' ? 'bg-red-500' : 'bg-amber-500'
        }`} />
      )}
      {STATE_LABELS[state] || state}
    </Badge>
  );
}

/* ══════════════════════════════════════════════════════════════
   CLOUD IDE VIEW — file tree + Monaco editor + terminal
   ══════════════════════════════════════════════════════════════ */
function CloudIDE({
  workstation,
  config,
  onDisconnect,
}: {
  workstation: Workstation;
  config: Config | null;
  onDisconnect: () => void;
}) {
  const { toast } = useToast();
  const [cwd, setCwd] = useState('/home/user');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [openFilePath, setOpenFilePath] = useState<string | null>(null);
  const [openFileContent, setOpenFileContent] = useState('');
  const [editorDirty, setEditorDirty] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([
    { id: 0, type: 'system', text: `Connected to ${workstation.displayName} (${workstation.id})`, timestamp: new Date() },
    { id: 1, type: 'system', text: `Host: ${workstation.host || 'resolving...'}`, timestamp: new Date() },
  ]);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalRunning, setTerminalRunning] = useState(false);
  const [terminalExpanded, setTerminalExpanded] = useState(false);
  const [sidebarWidth] = useState(280);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const lineIdRef = useRef(2);

  const addTerminalLine = useCallback((type: TerminalLine['type'], text: string) => {
    const id = lineIdRef.current++;
    setTerminalLines(prev => [...prev, { id, type, text, timestamp: new Date() }]);
  }, []);

  /* ── File operations ── */
  const fetchFiles = useCallback(async (path: string) => {
    setFilesLoading(true);
    try {
      const data = await apiJsonRequest<{ success: boolean; entries: FileEntry[]; cwd: string }>(
        'GET', `${wsApi(workstation)}/files?path=${encodeURIComponent(path)}`,
      );
      if (data.success) {
        setFiles(data.entries || []);
        setCwd(data.cwd || path);
      }
    } catch (err) {
      addTerminalLine('error', `Failed to list files: ${err}`);
    } finally {
      setFilesLoading(false);
    }
  }, [workstation, addTerminalLine]);

  const openFile = async (entry: FileEntry) => {
    if (entry.type === 'directory') {
      fetchFiles(entry.path);
      return;
    }
    setFileLoading(true);
    try {
      const data = await apiJsonRequest<{ success: boolean; content: string; path: string }>(
        'GET', `${wsApi(workstation)}/file?path=${encodeURIComponent(entry.path)}`,
      );
      if (data.success) {
        setOpenFilePath(data.path);
        setOpenFileContent(data.content);
        setEditorDirty(false);
      }
    } catch (err) {
      toast({ title: 'Failed to open file', description: String(err), variant: 'destructive' });
    } finally {
      setFileLoading(false);
    }
  };

  const saveFile = async () => {
    if (!openFilePath) return;
    setSaving(true);
    try {
      const data = await apiJsonRequest<{ success: boolean; error?: string }>(
        'PUT', `${wsApi(workstation)}/file`,
        { path: openFilePath, content: openFileContent },
      );
      if (data.success) {
        setEditorDirty(false);
        toast({ title: 'File saved', description: openFilePath });
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const navigateUp = () => {
    const parent = cwd.split('/').slice(0, -1).join('/') || '/';
    fetchFiles(parent);
  };

  /* ── Terminal ── */
  const execCommand = async (command: string) => {
    if (!command.trim()) return;
    addTerminalLine('input', `$ ${command}`);
    setTerminalRunning(true);
    try {
      const data = await apiJsonRequest<{ success: boolean; stdout: string; stderr: string; exitCode: number }>(
        'POST', `${wsApi(workstation)}/exec`, { command },
      );
      if (data.stdout) addTerminalLine('output', data.stdout.trimEnd());
      if (data.stderr) addTerminalLine('error', data.stderr.trimEnd());
      if (data.exitCode !== 0) addTerminalLine('system', `Exit code: ${data.exitCode}`);
    } catch (err) {
      addTerminalLine('error', `Command failed: ${err}`);
    } finally {
      setTerminalRunning(false);
    }
  };

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = terminalInput.trim();
    if (!cmd) return;
    setTerminalInput('');
    execCommand(cmd);
  };

  useEffect(() => {
    fetchFiles(cwd);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLines]);

  const openFileName = openFilePath?.split('/').pop() || '';
  const language = openFileName ? inferLanguage(openFileName) : 'plaintext';
  const breadcrumbs = cwd.split('/').filter(Boolean);

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] -m-6 bg-[#1e1e2e]">
      {/* ── IDE Top Bar ── */}
      <div className="h-11 bg-[#181825] border-b border-[#313244] flex items-center px-3 gap-3 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDisconnect}
          className="h-7 px-2 text-[#cdd6f4] hover:bg-[#313244] hover:text-white"
        >
          <ArrowLeft className="w-3.5 h-3.5 mr-1.5" />
          Manager
        </Button>
        <div className="w-px h-5 bg-[#313244]" />
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold text-[#cdd6f4]">{workstation.displayName}</span>
          {config && (
            <Badge className="bg-[#313244] text-[#a6adc8] border-[#45475a] text-[10px]">
              <Cpu className="w-3 h-3 mr-1" /> {config.machineType}
            </Badge>
          )}
        </div>
        <div className="flex-1" />
        {openFilePath && (
          <div className="flex items-center gap-2">
            {editorDirty && (
              <div className="w-2 h-2 rounded-full bg-amber-400" title="Unsaved changes" />
            )}
            <span className="text-xs text-[#a6adc8] truncate max-w-[300px]">{openFilePath}</span>
          </div>
        )}
        <div className="flex items-center gap-1 ml-3">
          {openFilePath && editorDirty && (
            <Button
              variant="ghost"
              size="sm"
              onClick={saveFile}
              disabled={saving}
              className="h-7 px-2 text-emerald-400 hover:bg-[#313244]"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}
              Save
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTerminalExpanded(!terminalExpanded)}
            className="h-7 px-2 text-[#a6adc8] hover:bg-[#313244]"
          >
            <Terminal className="w-3.5 h-3.5 mr-1" />
            Terminal
          </Button>
        </div>
      </div>

      {/* ── Main IDE Area ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── File Explorer Sidebar ── */}
        <div
          className="shrink-0 bg-[#1e1e2e] border-r border-[#313244] flex flex-col"
          style={{ width: sidebarWidth }}
        >
          {/* Sidebar Header */}
          <div className="h-9 px-3 flex items-center justify-between border-b border-[#313244]">
            <span className="text-[10px] font-bold text-[#a6adc8] uppercase tracking-widest">Explorer</span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={navigateUp}
                className="p-1 rounded hover:bg-[#313244] text-[#a6adc8] hover:text-[#cdd6f4] transition-colors"
                title="Go up"
              >
                <FolderUp className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => fetchFiles(cwd)}
                className="p-1 rounded hover:bg-[#313244] text-[#a6adc8] hover:text-[#cdd6f4] transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${filesLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Breadcrumbs */}
          <div className="px-3 py-1.5 text-[11px] text-[#6c7086] truncate border-b border-[#313244]/50">
            <span className="hover:text-[#a6adc8] cursor-pointer" onClick={() => fetchFiles('/')}>
              /
            </span>
            {breadcrumbs.map((crumb, i) => (
              <span key={i}>
                <span
                  className="hover:text-[#a6adc8] cursor-pointer"
                  onClick={() => fetchFiles('/' + breadcrumbs.slice(0, i + 1).join('/'))}
                >
                  {crumb}
                </span>
                {i < breadcrumbs.length - 1 && <span className="mx-0.5">/</span>}
              </span>
            ))}
          </div>

          {/* File List */}
          <div className="flex-1 overflow-y-auto py-1">
            {filesLoading && files.length === 0 ? (
              <div className="flex items-center justify-center h-24 text-[#6c7086]">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span className="text-xs">Loading...</span>
              </div>
            ) : files.length === 0 ? (
              <div className="text-center text-[#6c7086] text-xs py-8">Empty directory</div>
            ) : (
              files.map((entry) => (
                <button
                  key={entry.path}
                  onClick={() => openFile(entry)}
                  className={`w-full flex items-center gap-2 px-3 py-1 text-left hover:bg-[#313244]/60 transition-colors group ${
                    openFilePath === entry.path ? 'bg-[#313244] text-[#cdd6f4]' : 'text-[#a6adc8]'
                  }`}
                >
                  {getFileIcon(entry)}
                  <span className="text-xs truncate flex-1">{entry.name}</span>
                  {entry.type === 'file' && (
                    <span className="text-[10px] text-[#585b70] group-hover:text-[#6c7086]">
                      {formatBytes(entry.size)}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>

          {/* Sidebar Footer */}
          <div className="px-3 py-2 border-t border-[#313244] text-[10px] text-[#585b70]">
            {files.length} items in {cwd}
          </div>
        </div>

        {/* ── Editor + Terminal Area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Editor */}
          <div className={`flex-1 overflow-hidden ${terminalExpanded ? '' : ''}`}>
            {fileLoading ? (
              <div className="flex items-center justify-center h-full bg-[#1e1e2e] text-[#6c7086]">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Loading file...
              </div>
            ) : openFilePath ? (
              <Editor
                height="100%"
                language={language}
                value={openFileContent}
                theme="vs-dark"
                onChange={(value) => {
                  setOpenFileContent(value || '');
                  setEditorDirty(true);
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineHeight: 20,
                  padding: { top: 12 },
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  wordWrap: 'on',
                  renderWhitespace: 'selection',
                  bracketPairColorization: { enabled: true },
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  cursorSmoothCaretAnimation: 'on',
                }}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full bg-[#1e1e2e] text-[#585b70]">
                <div className="w-20 h-20 rounded-2xl bg-[#313244]/50 flex items-center justify-center mb-4">
                  <Monitor className="w-10 h-10 text-[#45475a]" />
                </div>
                <p className="text-sm font-medium text-[#6c7086] mb-1">Cloud IDE</p>
                <p className="text-xs text-[#585b70] max-w-xs text-center">
                  Select a file from the explorer to start editing.
                  Use the terminal below to run commands on the workstation.
                </p>
              </div>
            )}
          </div>

          {/* Terminal Panel */}
          <div className={`border-t border-[#313244] bg-[#11111b] flex flex-col shrink-0 transition-all ${
            terminalExpanded ? 'h-[45%]' : 'h-[200px]'
          }`}>
            {/* Terminal Header */}
            <div className="h-8 px-3 flex items-center justify-between border-b border-[#313244]/50 shrink-0">
              <div className="flex items-center gap-2">
                <Terminal className="w-3.5 h-3.5 text-[#a6adc8]" />
                <span className="text-[10px] font-bold text-[#a6adc8] uppercase tracking-wider">Terminal</span>
                {terminalRunning && (
                  <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[9px] px-1.5 py-0">
                    <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" /> Running
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    setTerminalLines([
                      { id: lineIdRef.current++, type: 'system', text: 'Terminal cleared', timestamp: new Date() },
                    ]);
                  }}
                  className="p-1 rounded hover:bg-[#313244] text-[#585b70] hover:text-[#a6adc8] text-[10px]"
                >
                  Clear
                </button>
                <button
                  onClick={() => setTerminalExpanded(!terminalExpanded)}
                  className="p-1 rounded hover:bg-[#313244] text-[#585b70] hover:text-[#a6adc8]"
                >
                  {terminalExpanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* Terminal Output */}
            <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs">
              {terminalLines.map((line) => (
                <div
                  key={line.id}
                  className={`py-0.5 leading-5 whitespace-pre-wrap break-all ${
                    line.type === 'input' ? 'text-[#89b4fa]' :
                    line.type === 'error' ? 'text-[#f38ba8]' :
                    line.type === 'system' ? 'text-[#6c7086] italic' :
                    'text-[#cdd6f4]'
                  }`}
                >
                  {line.text}
                </div>
              ))}
              <div ref={terminalEndRef} />
            </div>

            {/* Terminal Input */}
            <form onSubmit={handleTerminalSubmit} className="px-3 py-2 border-t border-[#313244]/50 shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-[#89b4fa] text-xs font-mono font-bold">$</span>
                <input
                  type="text"
                  value={terminalInput}
                  onChange={(e) => setTerminalInput(e.target.value)}
                  placeholder="Type a command..."
                  disabled={terminalRunning}
                  className="flex-1 bg-transparent border-none outline-none text-xs font-mono text-[#cdd6f4] placeholder:text-[#45475a]"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={terminalRunning || !terminalInput.trim()}
                  className="p-1 rounded hover:bg-[#313244] text-[#585b70] hover:text-[#a6adc8] disabled:opacity-30"
                >
                  <CornerDownLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   WORKSTATION MANAGER VIEW — cluster/config/workstation tree
   ══════════════════════════════════════════════════════════════ */
export default function WorkstationsTab() {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<ViewMode>('manager');
  const [loading, setLoading] = useState(true);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [configs, setConfigs] = useState<Record<string, Config[]>>({});
  const [workstations, setWorkstations] = useState<Record<string, Workstation[]>>({});
  const [expandedClusters, setExpandedClusters] = useState<Set<string>>(new Set());
  const [expandedConfigs, setExpandedConfigs] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [createParent, setCreateParent] = useState<{ clusterId?: string; configId?: string }>({});
  const [connectedWs, setConnectedWs] = useState<Workstation | null>(null);
  const [connectedConfig, setConnectedConfig] = useState<Config | null>(null);

  // Create form fields
  const [formId, setFormId] = useState('');
  const [formDisplayName, setFormDisplayName] = useState('');
  const [formMachineType, setFormMachineType] = useState('e2-standard-4');
  const [formDiskSize, setFormDiskSize] = useState('50');
  const [formIdleTimeout, setFormIdleTimeout] = useState('1200');
  const [formContainerImage, setFormContainerImage] = useState('');

  /* ── Data fetching ── */
  const fetchClusters = useCallback(async () => {
    try {
      const data = await apiJsonRequest<{ success: boolean; clusters?: Cluster[] }>(
        'GET', '/api/ops/workstations/clusters',
      );
      if (data.success) {
        setClusters(data.clusters || []);
        for (const cluster of data.clusters || []) {
          fetchConfigs(cluster.id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch clusters:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchConfigs = async (clusterId: string) => {
    try {
      const data = await apiJsonRequest<{ success: boolean; configs?: Config[] }>(
        'GET', `/api/ops/workstations/clusters/${clusterId}/configs`,
      );
      if (data.success) {
        setConfigs(prev => ({ ...prev, [clusterId]: data.configs || [] }));
        for (const config of data.configs || []) {
          fetchWorkstations(clusterId, config.id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch configs:', err);
    }
  };

  const fetchWorkstations = async (clusterId: string, configId: string) => {
    try {
      const data = await apiJsonRequest<{ success: boolean; workstations?: Workstation[] }>(
        'GET', `/api/ops/workstations/clusters/${clusterId}/configs/${configId}/workstations`,
      );
      if (data.success) {
        setWorkstations(prev => ({ ...prev, [`${clusterId}/${configId}`]: data.workstations || [] }));
      }
    } catch (err) {
      console.error('Failed to fetch workstations:', err);
    }
  };

  useEffect(() => { fetchClusters(); }, [fetchClusters]);

  /* ── Actions ── */
  const setActionState = (key: string, loading: boolean) => {
    setActionLoading(prev => ({ ...prev, [key]: loading }));
  };

  const startWorkstation = async (ws: Workstation) => {
    const key = `start-${ws.id}`;
    setActionState(key, true);
    try {
      const data = await apiJsonRequest<{ success: boolean; error?: string }>(
        'POST', `${wsApi(ws)}/start`, {},
      );
      if (data.success) {
        toast({ title: 'Workstation starting', description: `${ws.displayName} is starting up...` });
        fetchWorkstations(ws.clusterId, ws.configId);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      toast({ title: 'Failed to start', description: String(err), variant: 'destructive' });
    } finally {
      setActionState(key, false);
    }
  };

  const stopWorkstation = async (ws: Workstation) => {
    const key = `stop-${ws.id}`;
    setActionState(key, true);
    try {
      const data = await apiJsonRequest<{ success: boolean; error?: string }>(
        'POST', `${wsApi(ws)}/stop`, {},
      );
      if (data.success) {
        toast({ title: 'Workstation stopping', description: `${ws.displayName} is shutting down...` });
        fetchWorkstations(ws.clusterId, ws.configId);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      toast({ title: 'Failed to stop', description: String(err), variant: 'destructive' });
    } finally {
      setActionState(key, false);
    }
  };

  const connectToWorkstation = (ws: Workstation) => {
    if (ws.state !== 'STATE_RUNNING') {
      toast({ title: 'Not running', description: 'Start the workstation first.', variant: 'destructive' });
      return;
    }
    // Find config for the workstation
    const cfgList = configs[ws.clusterId] || [];
    const cfg = cfgList.find(c => c.id === ws.configId) || null;
    setConnectedWs(ws);
    setConnectedConfig(cfg);
    setViewMode('ide');
  };

  const deleteWorkstation = async (ws: Workstation) => {
    if (!confirm(`Delete workstation "${ws.displayName}"? This cannot be undone.`)) return;
    const key = `delete-${ws.id}`;
    setActionState(key, true);
    try {
      const data = await apiJsonRequest<{ success: boolean; error?: string }>(
        'DELETE', wsApi(ws),
      );
      if (data.success) {
        toast({ title: 'Workstation deleted', description: ws.displayName });
        fetchWorkstations(ws.clusterId, ws.configId);
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      toast({ title: 'Failed to delete', description: String(err), variant: 'destructive' });
    } finally {
      setActionState(key, false);
    }
  };

  const toggleCluster = (clusterId: string) => {
    setExpandedClusters(prev => {
      const next = new Set(prev);
      if (next.has(clusterId)) next.delete(clusterId);
      else { next.add(clusterId); fetchConfigs(clusterId); }
      return next;
    });
  };

  const toggleConfig = (configKey: string) => {
    setExpandedConfigs(prev => {
      const next = new Set(prev);
      if (next.has(configKey)) next.delete(configKey); else next.add(configKey);
      return next;
    });
  };

  const resetForm = () => {
    setCreateMode(null);
    setCreateParent({});
    setFormId('');
    setFormDisplayName('');
    setFormMachineType('e2-standard-4');
    setFormDiskSize('50');
    setFormIdleTimeout('1200');
    setFormContainerImage('');
  };

  const handleCreate = async () => {
    if (!formId || !formDisplayName) {
      toast({ title: 'Missing fields', description: 'ID and Display Name are required.', variant: 'destructive' });
      return;
    }
    setActionState('create', true);
    try {
      let url = '';
      let body: any = {};
      if (createMode === 'cluster') {
        url = '/api/ops/workstations/clusters';
        body = { clusterId: formId, displayName: formDisplayName };
      } else if (createMode === 'config') {
        url = `/api/ops/workstations/clusters/${createParent.clusterId}/configs`;
        body = {
          configId: formId, displayName: formDisplayName, machineType: formMachineType,
          bootDiskSizeGb: parseInt(formDiskSize) || 50, idleTimeout: formIdleTimeout,
          containerImage: formContainerImage || undefined,
        };
      } else if (createMode === 'workstation') {
        url = `/api/ops/workstations/clusters/${createParent.clusterId}/configs/${createParent.configId}/workstations`;
        body = { workstationId: formId, displayName: formDisplayName };
      }
      const data = await apiJsonRequest<{ success: boolean; error?: string }>('POST', url, body);
      if (data.success) {
        toast({ title: `${createMode} created`, description: formDisplayName });
        resetForm();
        fetchClusters();
      } else {
        throw new Error(data.error);
      }
    } catch (err) {
      toast({ title: 'Create failed', description: String(err), variant: 'destructive' });
    } finally {
      setActionState('create', false);
    }
  };

  /* ── Counts ── */
  const totalWorkstations = Object.values(workstations).reduce((sum, list) => sum + list.length, 0);
  const runningWorkstations = Object.values(workstations).reduce(
    (sum, list) => sum + list.filter(ws => ws.state === 'STATE_RUNNING').length, 0,
  );

  /* ── IDE View ── */
  if (viewMode === 'ide' && connectedWs) {
    return (
      <CloudIDE
        workstation={connectedWs}
        config={connectedConfig}
        onDisconnect={() => {
          setViewMode('manager');
          setConnectedWs(null);
          setConnectedConfig(null);
        }}
      />
    );
  }

  /* ── Manager View ── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin mr-3" />
        Loading Cloud Workstations...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Cloud className="w-6 h-6 text-indigo-500" />
            Cloud Workstations
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Managed cloud development environments with integrated IDE
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 bg-slate-50 rounded-xl px-4 py-2.5 border border-slate-200">
            <div className="text-center">
              <div className="text-lg font-bold text-slate-900">{clusters.length}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Clusters</div>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="text-center">
              <div className="text-lg font-bold text-slate-900">{totalWorkstations}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Workstations</div>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="text-center">
              <div className="text-lg font-bold text-emerald-600">{runningWorkstations}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-medium">Running</div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setLoading(true); fetchClusters(); }}
            className="h-9"
          >
            <RefreshCw className="w-4 h-4 mr-1.5" /> Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => { resetForm(); setCreateMode('cluster'); }}
            className="h-9 bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="w-4 h-4 mr-1.5" /> New Cluster
          </Button>
        </div>
      </div>

      {/* Create Form */}
      {createMode && (
        <div className="bg-indigo-50/50 border border-indigo-200 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-indigo-900 flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Create New {createMode === 'cluster' ? 'Cluster' : createMode === 'config' ? 'Configuration' : 'Workstation'}
            </h3>
            <Button variant="ghost" size="sm" onClick={resetForm} className="h-7 w-7 p-0">
              <X className="w-4 h-4" />
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">ID (lowercase, no spaces)</label>
              <Input
                value={formId}
                onChange={(e) => setFormId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder={`my-${createMode}`}
                className="h-9 text-sm bg-white"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600 mb-1 block">Display Name</label>
              <Input
                value={formDisplayName}
                onChange={(e) => setFormDisplayName(e.target.value)}
                placeholder={`My ${createMode === 'cluster' ? 'Cluster' : createMode === 'config' ? 'Config' : 'Workstation'}`}
                className="h-9 text-sm bg-white"
              />
            </div>
          </div>

          {createMode === 'config' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Machine Type</label>
                <Select value={formMachineType} onValueChange={setFormMachineType}>
                  <SelectTrigger className="h-9 text-sm bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MACHINE_TYPES.map(mt => (
                      <SelectItem key={mt.value} value={mt.value}>{mt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Boot Disk (GB)</label>
                <Input type="number" value={formDiskSize} onChange={(e) => setFormDiskSize(e.target.value)}
                  className="h-9 text-sm bg-white" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Idle Timeout (seconds)</label>
                <Input type="number" value={formIdleTimeout} onChange={(e) => setFormIdleTimeout(e.target.value)}
                  placeholder="1200" className="h-9 text-sm bg-white" />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Container Image (optional)</label>
                <Input value={formContainerImage} onChange={(e) => setFormContainerImage(e.target.value)}
                  placeholder="us-central1-docker.pkg.dev/..." className="h-9 text-sm bg-white" />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={resetForm}>Cancel</Button>
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={actionLoading['create'] || !formId || !formDisplayName}
              className="bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              {actionLoading['create'] ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Plus className="w-4 h-4 mr-1.5" />}
              Create
            </Button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {clusters.length === 0 && !createMode && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mx-auto mb-4">
            <Cloud className="w-8 h-8 text-indigo-400" />
          </div>
          <h3 className="text-lg font-semibold text-slate-800 mb-2">No Workstation Clusters</h3>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Create a workstation cluster to get started with managed cloud development environments.
          </p>
          <Button
            onClick={() => setCreateMode('cluster')}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" /> Create First Cluster
          </Button>
        </div>
      )}

      {/* Cluster Tree */}
      <div className="space-y-3">
        {clusters.map(cluster => {
          const isExpanded = expandedClusters.has(cluster.id);
          const clusterConfigs = configs[cluster.id] || [];

          return (
            <div key={cluster.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              {/* Cluster Header */}
              <button
                onClick={() => toggleCluster(cluster.id)}
                className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 transition-colors text-left"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-sm shrink-0">
                  <Server className="w-5 h-5 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900">{cluster.displayName}</span>
                    <StateBadge state={cluster.state} />
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                    <span>ID: {cluster.id}</span>
                    {cluster.controlPlaneIp && <span>IP: {cluster.controlPlaneIp}</span>}
                    <span>Created: {formatTime(cluster.createTime)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs">
                    {clusterConfigs.length} config{clusterConfigs.length !== 1 ? 's' : ''}
                  </Badge>
                  <Button
                    variant="outline" size="sm" className="h-8 text-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCreateMode('config');
                      setCreateParent({ clusterId: cluster.id });
                      setFormId(''); setFormDisplayName('');
                    }}
                  >
                    <Plus className="w-3 h-3 mr-1" /> Config
                  </Button>
                </div>
              </button>

              {/* Configs */}
              {isExpanded && (
                <div className="border-t border-slate-100">
                  {clusterConfigs.length === 0 ? (
                    <div className="px-5 py-6 text-center text-sm text-slate-400">
                      No configurations in this cluster.
                      <Button variant="link" size="sm" className="ml-1 text-indigo-600"
                        onClick={() => { setCreateMode('config'); setCreateParent({ clusterId: cluster.id }); }}>
                        Create one
                      </Button>
                    </div>
                  ) : (
                    clusterConfigs.map(config => {
                      const configKey = `${cluster.id}/${config.id}`;
                      const isConfigExpanded = expandedConfigs.has(configKey);
                      const configWorkstations = workstations[configKey] || [];

                      return (
                        <div key={config.id} className="border-t border-slate-100 first:border-t-0">
                          {/* Config Header */}
                          <button
                            onClick={() => toggleConfig(configKey)}
                            className="w-full flex items-center gap-3 px-5 py-3 pl-12 hover:bg-slate-50/80 transition-colors text-left"
                          >
                            {isConfigExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
                            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                              <Settings className="w-4 h-4 text-violet-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-800">{config.displayName}</span>
                                <StateBadge state={config.state} />
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500">
                                <span className="flex items-center gap-1"><Cpu className="w-3 h-3" /> {config.machineType}</span>
                                <span className="flex items-center gap-1"><HardDrive className="w-3 h-3" /> {config.bootDiskSizeGb} GB</span>
                                <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Idle: {Math.round(parseInt(config.idleTimeout) / 60)}m</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge className="bg-slate-100 text-slate-600 border-slate-200 text-xs">
                                {configWorkstations.length} ws
                              </Badge>
                              <Button variant="outline" size="sm" className="h-7 text-xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setCreateMode('workstation');
                                  setCreateParent({ clusterId: cluster.id, configId: config.id });
                                  setFormId(''); setFormDisplayName('');
                                }}>
                                <Plus className="w-3 h-3 mr-1" /> Workstation
                              </Button>
                            </div>
                          </button>

                          {/* Workstations */}
                          {isConfigExpanded && (
                            <div className="bg-slate-50/50">
                              {configWorkstations.length === 0 ? (
                                <div className="px-5 py-4 pl-20 text-sm text-slate-400">
                                  No workstations.
                                  <Button variant="link" size="sm" className="ml-1 text-indigo-600"
                                    onClick={() => { setCreateMode('workstation'); setCreateParent({ clusterId: cluster.id, configId: config.id }); }}>
                                    Create one
                                  </Button>
                                </div>
                              ) : (
                                configWorkstations.map(ws => (
                                  <div
                                    key={ws.id}
                                    className="flex items-center gap-3 px-5 py-3 pl-20 border-t border-slate-100 hover:bg-white/80 transition-colors"
                                  >
                                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                                      ws.state === 'STATE_RUNNING' ? 'bg-emerald-100' :
                                      ws.state === 'STATE_STARTING' || ws.state === 'STATE_STOPPING' ? 'bg-amber-100' :
                                      'bg-slate-100'
                                    }`}>
                                      <Monitor className={`w-4.5 h-4.5 ${
                                        ws.state === 'STATE_RUNNING' ? 'text-emerald-600' :
                                        ws.state === 'STATE_STARTING' || ws.state === 'STATE_STOPPING' ? 'text-amber-600' :
                                        'text-slate-500'
                                      }`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium text-slate-800">{ws.displayName}</span>
                                        <StateBadge state={ws.state} />
                                        {ws.reconciling && (
                                          <Badge className="bg-amber-50 text-amber-600 border-amber-200 text-[10px]">
                                            <Loader2 className="w-3 h-3 mr-1 animate-spin" /> Reconciling
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500">
                                        <span>ID: {ws.id}</span>
                                        {ws.startTime && <span>Started: {formatTime(ws.startTime)}</span>}
                                        {ws.host && <span className="text-indigo-600 truncate max-w-[200px]">{ws.host}</span>}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      {ws.state === 'STATE_STOPPED' && (
                                        <Button
                                          variant="outline" size="sm"
                                          className="h-8 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                          onClick={() => startWorkstation(ws)}
                                          disabled={actionLoading[`start-${ws.id}`]}
                                        >
                                          {actionLoading[`start-${ws.id}`]
                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            : <><Play className="w-3.5 h-3.5 mr-1" /> Start</>}
                                        </Button>
                                      )}
                                      {ws.state === 'STATE_RUNNING' && (
                                        <>
                                          <Button
                                            variant="outline" size="sm"
                                            className="h-8 text-xs text-indigo-700 border-indigo-200 hover:bg-indigo-50 font-semibold"
                                            onClick={() => connectToWorkstation(ws)}
                                          >
                                            <Plug className="w-3.5 h-3.5 mr-1" /> Connect IDE
                                          </Button>
                                          <Button
                                            variant="outline" size="sm"
                                            className="h-8 text-xs text-orange-700 border-orange-200 hover:bg-orange-50"
                                            onClick={() => stopWorkstation(ws)}
                                            disabled={actionLoading[`stop-${ws.id}`]}
                                          >
                                            {actionLoading[`stop-${ws.id}`]
                                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                              : <><Square className="w-3.5 h-3.5 mr-1" /> Stop</>}
                                          </Button>
                                        </>
                                      )}
                                      {(ws.state === 'STATE_STARTING' || ws.state === 'STATE_STOPPING') && (
                                        <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-xs px-3 py-1">
                                          <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                          {ws.state === 'STATE_STARTING' ? 'Starting...' : 'Stopping...'}
                                        </Badge>
                                      )}
                                      <Button
                                        variant="ghost" size="sm"
                                        className="h-8 w-8 p-0 text-slate-400 hover:text-red-600"
                                        onClick={() => deleteWorkstation(ws)}
                                        disabled={actionLoading[`delete-${ws.id}`]}
                                      >
                                        {actionLoading[`delete-${ws.id}`]
                                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                          : <Trash2 className="w-3.5 h-3.5" />}
                                      </Button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info Footer */}
      {clusters.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center shrink-0 mt-0.5">
            <Cloud className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-800">Cloud IDE Integration</p>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              Click <strong>Connect IDE</strong> on any running workstation to open the integrated development environment
              with file explorer, code editor, and terminal &mdash; all within Operations Hub.
              Workstations automatically stop after the idle timeout to save costs.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
