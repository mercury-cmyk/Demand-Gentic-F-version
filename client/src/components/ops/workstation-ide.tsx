import React, { useState, useEffect, useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiJsonRequest } from '@/lib/queryClient';
import {
  ArrowLeft, ChevronDown, ChevronRight, CornerDownLeft, Cpu, File, FileCode2,
  FolderClosed, FolderOpen, GitBranch, GitCommit, GitPullRequest, Loader2, Maximize2,
  Minus, Plug, Plus, RefreshCw, Save, Trash2, X, Upload, Download,
  Terminal as TerminalIcon, FilePlus, FolderPlus, Eye, Undo2,
} from 'lucide-react';

/* ── Types ── */
interface Workstation {
  id: string; name: string; displayName: string; configId: string; clusterId: string;
  state: string; host: string; createTime: string; startTime: string;
  reconciling: boolean; env: Record<string, string>;
}
interface Config {
  id: string; name: string; displayName: string; clusterId: string;
  machineType: string; bootDiskSizeGb: number; idleTimeout: string;
  runningTimeout: string; containerImage: string | null; state: string;
  createTime: string; degraded: boolean;
}
interface TerminalLine {
  id: number; type: 'input' | 'output' | 'error' | 'system'; text: string; timestamp: Date;
}
interface FileEntry {
  name: string; type: 'file' | 'directory'; path: string;
  size?: number; permissions?: string;
}
interface FileTab {
  path: string; content: string; originalContent: string; language: string;
}
interface GitFileStatus {
  path: string; status: string; staged: boolean; modified: boolean;
  untracked: boolean; deleted: boolean; added: boolean;
}
interface GitCommitEntry {
  hash: string; shortHash: string; author: string; email: string;
  relativeDate: string; message: string;
}
interface GitBranchEntry { name: string; current: boolean; remote: boolean; }

type SidePanel = 'files' | 'git' | 'terminal';

/* ── Helpers ── */
function wsApi(ws: Workstation) {
  return `/api/ops/workstations/clusters/${ws.clusterId}/configs/${ws.configId}/workstations/${ws.id}`;
}
function wsGitApi(ws: Workstation) {
  return `${wsApi(ws)}/git`;
}
function fileName(p: string) { return p.split('/').pop() || p; }

function inferLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts': case 'tsx': return 'typescript';
    case 'js': case 'jsx': case 'mjs': case 'cjs': return 'javascript';
    case 'json': return 'json'; case 'css': return 'css'; case 'scss': return 'scss';
    case 'html': return 'html'; case 'md': return 'markdown';
    case 'sh': case 'bash': return 'shell'; case 'yml': case 'yaml': return 'yaml';
    case 'sql': return 'sql'; case 'py': return 'python'; case 'go': return 'go';
    case 'rs': return 'rust'; case 'dockerfile': return 'dockerfile'; case 'xml': case 'svg': return 'xml';
    default: return 'plaintext';
  }
}

function getFileIcon(entry: { type: string; path: string }, isExpanded?: boolean) {
  if (entry.type === 'directory') {
    return isExpanded
      ? <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
      : <FolderClosed className="w-4 h-4 text-amber-400 shrink-0" />;
  }
  const lang = inferLanguage(entry.path);
  return lang !== 'plaintext'
    ? <FileCode2 className="w-4 h-4 text-sky-400 shrink-0" />
    : <File className="w-4 h-4 text-slate-400 shrink-0" />;
}

function buildWorkstationAuthUrl(ideUrl: string, accessToken: string) {
  const u = ideUrl.replace(/\/$/, '');
  return `${u}/_workstation/authenticate?access_token=${encodeURIComponent(accessToken)}&redirect_url=${encodeURIComponent('/')}`;
}
function openLoadingPopup(): Window | null {
  const p = window.open('', '_blank');
  if (!p) return null;
  p.document.write(`<!DOCTYPE html><html><head><title>Cloud IDE</title><style>body{margin:0;font-family:system-ui;background:#1e1e2e;color:#cdd6f4;display:flex;align-items:center;justify-content:center;height:100vh}.l{text-align:center}.s{width:40px;height:40px;border:3px solid #313244;border-top:3px solid #89b4fa;border-radius:50%;animation:r 1s linear infinite;margin:0 auto 16px}@keyframes r{to{transform:rotate(360deg)}}</style></head><body><div class="l"><div class="s"></div><p>Opening IDE…</p></div></body></html>`);
  p.document.close();
  return p;
}
interface IdeInfo { success: boolean; url: string; host: string; accessToken: string; expireTime: string; error?: string; }

/* ══════════════════════════════════════════════════════════════
   WORKSTATION IDE — VS Code-like IDE with file browser, editor,
   Git source control, and integrated terminal
   ══════════════════════════════════════════════════════════════ */
export default function WorkstationIDE({
  workstation,
  config,
  onDisconnect,
}: {
  workstation: Workstation;
  config: Config | null;
  onDisconnect: () => void;
}) {
  const { toast } = useToast();

  /* ── Panel state ── */
  const [sidePanel, setSidePanel] = useState<SidePanel>('files');
  const [sidebarWidth] = useState(260);
  const [showTerminal, setShowTerminal] = useState(false);

  /* ── File browser state ── */
  const [cwd, setCwd] = useState('/home/user');
  const [fileTree, setFileTree] = useState<Record<string, FileEntry[]>>({});
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set(['/home/user']));
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());

  /* ── Editor state ── */
  const [tabs, setTabs] = useState<FileTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);

  /* ── Terminal state ── */
  const [terminalLines, setTerminalLines] = useState<TerminalLine[]>([
    { id: 0, type: 'system', text: `Connected to ${workstation.displayName}`, timestamp: new Date() },
  ]);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalRunning, setTerminalRunning] = useState(false);
  const lineIdRef = useRef(1);
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const terminalInputRef = useRef<HTMLInputElement>(null);

  /* ── Git state ── */
  const [gitBranch, setGitBranch] = useState('');
  const [gitFiles, setGitFiles] = useState<GitFileStatus[]>([]);
  const [gitClean, setGitClean] = useState(true);
  const [gitCommits, setGitCommits] = useState<GitCommitEntry[]>([]);
  const [gitBranches, setGitBranches] = useState<GitBranchEntry[]>([]);
  const [commitMessage, setCommitMessage] = useState('');
  const [gitLoading, setGitLoading] = useState(false);
  const [gitDiff, setGitDiff] = useState('');
  const [showDiff, setShowDiff] = useState(false);
  const [cloneUrl, setCloneUrl] = useState('');
  const [showClone, setShowClone] = useState(false);

  /* ── IDE opened tracker ── */
  const [ideOpened, setIdeOpened] = useState(false);

  // ─── File Browser ─────────────────────────────────────────────────────────

  const fetchDirectory = useCallback(async (dirPath: string) => {
    setLoadingDirs(prev => new Set(prev).add(dirPath));
    try {
      const data = await apiJsonRequest<{ success: boolean; entries?: FileEntry[] }>(
        'GET', `${wsApi(workstation)}/files?path=${encodeURIComponent(dirPath)}`,
      );
      if (data.success && data.entries) {
        const sorted = data.entries.sort((a, b) => {
          if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
        setFileTree(prev => ({ ...prev, [dirPath]: sorted }));
      }
    } catch (err) {
      console.error('Failed to fetch dir:', dirPath, err);
    } finally {
      setLoadingDirs(prev => { const n = new Set(prev); n.delete(dirPath); return n; });
    }
  }, [workstation]);

  useEffect(() => { fetchDirectory('/home/user'); }, [fetchDirectory]);

  const toggleDir = (dirPath: string) => {
    setExpandedDirs(prev => {
      const n = new Set(prev);
      if (n.has(dirPath)) {
        n.delete(dirPath);
      } else {
        n.add(dirPath);
        if (!fileTree[dirPath]) fetchDirectory(dirPath);
      }
      return n;
    });
  };

  const openFile = async (filePath: string) => {
    // Check if already open
    const existing = tabs.find(t => t.path === filePath);
    if (existing) { setActiveTabPath(filePath); return; }
    try {
      const data = await apiJsonRequest<{ success: boolean; content?: string }>(
        'GET', `${wsApi(workstation)}/file?path=${encodeURIComponent(filePath)}`,
      );
      if (data.success && data.content !== undefined) {
        const tab: FileTab = {
          path: filePath,
          content: data.content,
          originalContent: data.content,
          language: inferLanguage(filePath),
        };
        setTabs(prev => [...prev, tab]);
        setActiveTabPath(filePath);
      }
    } catch (err) {
      toast({ title: 'Failed to open file', description: String(err), variant: 'destructive' });
    }
  };

  const closeTab = (path: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.path !== path);
      if (activeTabPath === path) {
        setActiveTabPath(next.length > 0 ? next[next.length - 1].path : null);
      }
      return next;
    });
  };

  const saveFile = async (path: string) => {
    const tab = tabs.find(t => t.path === path);
    if (!tab) return;
    try {
      await apiJsonRequest<{ success: boolean }>(
        'PUT', `${wsApi(workstation)}/file`,
        { path: tab.path, content: tab.content },
      );
      setTabs(prev => prev.map(t => t.path === path ? { ...t, originalContent: t.content } : t));
      toast({ title: 'Saved', description: fileName(path) });
    } catch (err) {
      toast({ title: 'Save failed', description: String(err), variant: 'destructive' });
    }
  };

  const handleEditorChange = (value: string | undefined) => {
    if (!activeTabPath || value === undefined) return;
    setTabs(prev => prev.map(t => t.path === activeTabPath ? { ...t, content: value } : t));
  };

  // Ctrl+S save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (activeTabPath) saveFile(activeTabPath);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  // ─── Terminal ─────────────────────────────────────────────────────────────

  const addLine = useCallback((type: TerminalLine['type'], text: string) => {
    const id = lineIdRef.current++;
    setTerminalLines(prev => [...prev, { id, type, text, timestamp: new Date() }]);
  }, []);

  const execCommand = async (command: string) => {
    if (!command.trim()) return;
    addLine('input', `$ ${command}`);
    setTerminalRunning(true);
    try {
      const data = await apiJsonRequest<{ stdout: string; stderr: string; exitCode: number }>(
        'POST', `${wsApi(workstation)}/exec`, { command },
      );
      if (data.stdout) addLine('output', data.stdout.trimEnd());
      if (data.stderr) addLine('error', data.stderr.trimEnd());
      if (data.exitCode !== 0) addLine('system', `Exit code: ${data.exitCode}`);
    } catch (err) {
      addLine('error', `Failed: ${err}`);
    } finally {
      setTerminalRunning(false);
      terminalInputRef.current?.focus();
    }
  };

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [terminalLines]);

  // ─── Git Operations ───────────────────────────────────────────────────────

  const refreshGitStatus = useCallback(async () => {
    setGitLoading(true);
    try {
      const [statusRes, logRes, branchRes] = await Promise.all([
        apiJsonRequest<{ success: boolean; branch: string; files: GitFileStatus[]; clean: boolean }>(
          'GET', `${wsGitApi(workstation)}/status?cwd=${encodeURIComponent(cwd)}`,
        ),
        apiJsonRequest<{ success: boolean; commits: GitCommitEntry[] }>(
          'GET', `${wsGitApi(workstation)}/log?cwd=${encodeURIComponent(cwd)}&limit=15`,
        ),
        apiJsonRequest<{ success: boolean; branches: GitBranchEntry[] }>(
          'GET', `${wsGitApi(workstation)}/branches?cwd=${encodeURIComponent(cwd)}`,
        ),
      ]);
      if (statusRes.success) {
        setGitBranch(statusRes.branch);
        setGitFiles(statusRes.files);
        setGitClean(statusRes.clean);
      }
      if (logRes.success) setGitCommits(logRes.commits);
      if (branchRes.success) setGitBranches(branchRes.branches);
    } catch (err) {
      console.error('Git status error:', err);
    } finally {
      setGitLoading(false);
    }
  }, [workstation, cwd]);

  const gitStage = async (files: string[]) => {
    try {
      await apiJsonRequest('POST', `${wsGitApi(workstation)}/stage`, { files, cwd });
      refreshGitStatus();
    } catch (err) { toast({ title: 'Stage failed', description: String(err), variant: 'destructive' }); }
  };

  const gitUnstage = async (files: string[]) => {
    try {
      await apiJsonRequest('POST', `${wsGitApi(workstation)}/unstage`, { files, cwd });
      refreshGitStatus();
    } catch (err) { toast({ title: 'Unstage failed', description: String(err), variant: 'destructive' }); }
  };

  const gitCommitChanges = async () => {
    if (!commitMessage.trim()) {
      toast({ title: 'Enter a commit message', variant: 'destructive' });
      return;
    }
    try {
      const res = await apiJsonRequest<{ success: boolean; stdout: string; stderr: string }>(
        'POST', `${wsGitApi(workstation)}/commit`, { message: commitMessage, cwd },
      );
      if (res.success) {
        toast({ title: 'Committed', description: commitMessage.substring(0, 60) });
        setCommitMessage('');
        refreshGitStatus();
      } else {
        toast({ title: 'Commit failed', description: res.stderr, variant: 'destructive' });
      }
    } catch (err) { toast({ title: 'Commit error', description: String(err), variant: 'destructive' }); }
  };

  const gitPush = async () => {
    setGitLoading(true);
    try {
      const res = await apiJsonRequest<{ success: boolean; stdout: string; stderr: string }>(
        'POST', `${wsGitApi(workstation)}/push`, { cwd },
      );
      toast({ title: res.success ? 'Pushed' : 'Push failed', description: res.stderr || res.stdout });
      if (res.success) refreshGitStatus();
    } catch (err) { toast({ title: 'Push error', description: String(err), variant: 'destructive' }); }
    finally { setGitLoading(false); }
  };

  const gitPull = async () => {
    setGitLoading(true);
    try {
      const res = await apiJsonRequest<{ success: boolean; stdout: string; stderr: string }>(
        'POST', `${wsGitApi(workstation)}/pull`, { cwd },
      );
      toast({ title: res.success ? 'Pulled' : 'Pull failed', description: res.stderr || res.stdout });
      if (res.success) { refreshGitStatus(); fetchDirectory(cwd); }
    } catch (err) { toast({ title: 'Pull error', description: String(err), variant: 'destructive' }); }
    finally { setGitLoading(false); }
  };

  const gitClone = async () => {
    if (!cloneUrl.trim()) return;
    setGitLoading(true);
    try {
      const res = await apiJsonRequest<{ success: boolean; stdout: string; stderr: string }>(
        'POST', `${wsGitApi(workstation)}/clone`, { url: cloneUrl },
      );
      if (res.success) {
        toast({ title: 'Cloned', description: cloneUrl });
        setShowClone(false);
        setCloneUrl('');
        fetchDirectory('/home/user');
      } else {
        toast({ title: 'Clone failed', description: res.stderr, variant: 'destructive' });
      }
    } catch (err) { toast({ title: 'Clone error', description: String(err), variant: 'destructive' }); }
    finally { setGitLoading(false); }
  };

  const gitCheckout = async (branch: string) => {
    setGitLoading(true);
    try {
      const res = await apiJsonRequest<{ success: boolean; stderr: string }>(
        'POST', `${wsGitApi(workstation)}/checkout`, { branch, cwd },
      );
      if (res.success) {
        toast({ title: 'Switched', description: `Branch: ${branch}` });
        refreshGitStatus();
      } else {
        toast({ title: 'Checkout failed', description: res.stderr, variant: 'destructive' });
      }
    } catch (err) { toast({ title: 'Checkout error', description: String(err), variant: 'destructive' }); }
    finally { setGitLoading(false); }
  };

  const viewDiff = async (filePath?: string, staged?: boolean) => {
    try {
      const qs = new URLSearchParams({ cwd });
      if (filePath) qs.set('file', filePath);
      if (staged) qs.set('staged', 'true');
      const res = await apiJsonRequest<{ success: boolean; diff: string }>(
        'GET', `${wsGitApi(workstation)}/diff?${qs.toString()}`,
      );
      setGitDiff(res.diff || '(no changes)');
      setShowDiff(true);
    } catch (err) { toast({ title: 'Diff error', description: String(err), variant: 'destructive' }); }
  };

  // Load git status when switching to git panel
  useEffect(() => {
    if (sidePanel === 'git') refreshGitStatus();
  }, [sidePanel, refreshGitStatus]);

  // ─── IDE launcher ──────────────────────────────────────────────────────────

  const openIDEInNewTab = async () => {
    const popup = openLoadingPopup();
    try {
      const data = await apiJsonRequest<IdeInfo>('GET', `${wsApi(workstation)}/ide-url`);
      if (!data.success || !data.url) throw new Error(data.error || 'No IDE URL');
      const authUrl = buildWorkstationAuthUrl(data.url, data.accessToken);
      if (popup && !popup.closed) popup.location.replace(authUrl);
      else { const f = window.open(authUrl, '_blank'); if (!f) throw new Error('Popup blocked'); }
      setIdeOpened(true);
    } catch (err) {
      if (popup && !popup.closed) popup.close();
      toast({ title: 'IDE error', description: String(err), variant: 'destructive' });
    }
  };

  // ─── Active tab ────────────────────────────────────────────────────────────

  const activeTab = tabs.find(t => t.path === activeTabPath);
  const isDirty = (t: FileTab) => t.content !== t.originalContent;
  const stagedFiles = gitFiles.filter(f => f.staged);
  const unstagedFiles = gitFiles.filter(f => !f.staged);

  // ─── Render ────────────────────────────────────────────────────────────────

  const renderFileTree = (dirPath: string, depth = 0) => {
    const entries = fileTree[dirPath];
    if (!entries && loadingDirs.has(dirPath)) {
      return <div className="pl-4 py-1"><Loader2 className="w-3 h-3 animate-spin text-slate-500" /></div>;
    }
    if (!entries) return null;
    return entries.map((entry) => {
      const fullPath = entry.path;
      const isDir = entry.type === 'directory';
      const isExpanded = expandedDirs.has(fullPath);
      // Skip hidden files starting with . except common ones
      if (entry.name.startsWith('.') && !['..', '.git', '.github', '.env', '.gitignore'].includes(entry.name)) return null;
      return (
        <React.Fragment key={fullPath}>
          <button
            type="button"
            className={`w-full flex items-center gap-1.5 py-[3px] px-1.5 text-left text-xs hover:bg-[#2a2d3e] rounded-sm group ${
              activeTabPath === fullPath ? 'bg-[#2a2d3e] text-white' : 'text-[#cdd6f4]'
            }`}
            style={{ paddingLeft: `${depth * 12 + 6}px` }}
            onClick={() => isDir ? toggleDir(fullPath) : openFile(fullPath)}
            title={fullPath}
          >
            {isDir ? (
              isExpanded ? <ChevronDown className="w-3 h-3 text-[#585b70] shrink-0" /> : <ChevronRight className="w-3 h-3 text-[#585b70] shrink-0" />
            ) : <span className="w-3 shrink-0" />}
            {getFileIcon(entry, isExpanded)}
            <span className="truncate">{entry.name}</span>
          </button>
          {isDir && isExpanded && renderFileTree(fullPath, depth + 1)}
        </React.Fragment>
      );
    });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-160px)] -m-6 bg-[#1e1e2e] text-[#cdd6f4]">
      {/* ── Top Bar ── */}
      <div className="h-10 bg-[#181825] border-b border-[#313244] flex items-center px-2 gap-2 shrink-0">
        <Button variant="ghost" size="sm" onClick={onDisconnect}
          className="h-7 px-2 text-[#cdd6f4] hover:bg-[#313244] hover:text-white text-xs">
          <ArrowLeft className="w-3.5 h-3.5 mr-1" /> Back
        </Button>
        <div className="w-px h-5 bg-[#313244]" />
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs font-semibold">{workstation.displayName}</span>
          {config && (
            <Badge className="bg-[#313244] text-[#a6adc8] border-[#45475a] text-[10px]">
              <Cpu className="w-3 h-3 mr-1" />{config.machineType}
            </Badge>
          )}
        </div>

        {/* Git branch */}
        {gitBranch && (
          <>
            <div className="w-px h-5 bg-[#313244]" />
            <div className="flex items-center gap-1 text-xs text-[#a6adc8]">
              <GitBranch className="w-3 h-3" />
              <span>{gitBranch}</span>
              {!gitClean && <span className="text-amber-400 font-bold">*</span>}
            </div>
          </>
        )}

        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={() => setShowTerminal(!showTerminal)}
          className={`h-7 px-2 text-xs ${showTerminal ? 'text-emerald-400' : 'text-[#a6adc8]'} hover:bg-[#313244]`}>
          <TerminalIcon className="w-3.5 h-3.5 mr-1" />Terminal
        </Button>
        <Button variant="ghost" size="sm" onClick={openIDEInNewTab}
          className={`h-7 px-2 text-xs ${ideOpened ? 'text-emerald-400' : 'text-[#89b4fa]'} hover:bg-[#313244]`}>
          <Maximize2 className="w-3.5 h-3.5 mr-1" />{ideOpened ? 'Reopen IDE' : 'Open IDE'}
        </Button>
      </div>

      {/* ── Main Area ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Activity Bar (left icons) ── */}
        <div className="w-12 bg-[#181825] border-r border-[#313244] flex flex-col items-center py-2 gap-1 shrink-0">
          <button type="button" onClick={() => setSidePanel('files')} title="Explorer"
            className={`w-10 h-10 flex items-center justify-center rounded-lg ${sidePanel === 'files' ? 'bg-[#313244] text-white' : 'text-[#585b70] hover:text-[#a6adc8]'}`}>
            <File className="w-5 h-5" />
          </button>
          <button type="button" onClick={() => setSidePanel('git')} title="Source Control"
            className={`w-10 h-10 flex items-center justify-center rounded-lg relative ${sidePanel === 'git' ? 'bg-[#313244] text-white' : 'text-[#585b70] hover:text-[#a6adc8]'}`}>
            <GitBranch className="w-5 h-5" />
            {gitFiles.length > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-[#89b4fa] text-[#1e1e2e] text-[9px] font-bold rounded-full flex items-center justify-center">
                {gitFiles.length}
              </span>
            )}
          </button>
          <button type="button" onClick={() => { setSidePanel('terminal'); setShowTerminal(true); }} title="Terminal"
            className={`w-10 h-10 flex items-center justify-center rounded-lg ${sidePanel === 'terminal' ? 'bg-[#313244] text-white' : 'text-[#585b70] hover:text-[#a6adc8]'}`}>
            <TerminalIcon className="w-5 h-5" />
          </button>
        </div>

        {/* ── Side Panel ── */}
        <div className="bg-[#181825] border-r border-[#313244] flex flex-col overflow-hidden shrink-0"
          style={{ width: `${sidebarWidth}px` }}>

          {/* ═══ FILE EXPLORER ═══ */}
          {sidePanel === 'files' && (
            <>
              <div className="h-8 flex items-center justify-between px-3 text-[10px] text-[#a6adc8] uppercase tracking-wider font-semibold border-b border-[#313244] shrink-0">
                <span>Explorer</span>
                <div className="flex items-center gap-0.5">
                  <button type="button" onClick={() => fetchDirectory(cwd)} className="p-1 hover:bg-[#313244] rounded" title="Refresh">
                    <RefreshCw className="w-3 h-3" />
                  </button>
                </div>
              </div>
              {/* Working directory input */}
              <div className="px-2 py-1.5 border-b border-[#313244] shrink-0">
                <div className="flex items-center gap-1">
                  <FolderOpen className="w-3 h-3 text-amber-400 shrink-0" />
                  <input type="text" value={cwd} onChange={(e) => setCwd(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { fetchDirectory(cwd); setExpandedDirs(new Set([cwd])); } }}
                    className="flex-1 bg-transparent border-none outline-none text-[10px] text-[#cdd6f4] font-mono"
                    title="Working directory — press Enter to navigate"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto py-1">
                {renderFileTree(cwd)}
              </div>
            </>
          )}

          {/* ═══ GIT / SOURCE CONTROL ═══ */}
          {sidePanel === 'git' && (
            <>
              <div className="h-8 flex items-center justify-between px-3 text-[10px] text-[#a6adc8] uppercase tracking-wider font-semibold border-b border-[#313244] shrink-0">
                <span>Source Control</span>
                <div className="flex items-center gap-0.5">
                  <button type="button" onClick={refreshGitStatus} className="p-1 hover:bg-[#313244] rounded" title="Refresh"
                    disabled={gitLoading}>
                    <RefreshCw className={`w-3 h-3 ${gitLoading ? 'animate-spin' : ''}`} />
                  </button>
                  <button type="button" onClick={() => setShowClone(!showClone)} className="p-1 hover:bg-[#313244] rounded" title="Clone">
                    <Download className="w-3 h-3" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto">
                {/* Clone repo */}
                {showClone && (
                  <div className="px-2 py-2 border-b border-[#313244] space-y-1.5">
                    <div className="text-[10px] text-[#a6adc8] font-semibold">Clone Repository</div>
                    <input type="text" placeholder="https://github.com/user/repo.git" value={cloneUrl}
                      onChange={(e) => setCloneUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') gitClone(); }}
                      className="w-full bg-[#1e1e2e] border border-[#313244] rounded px-2 py-1 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa]" />
                    <div className="flex gap-1">
                      <Button size="sm" onClick={gitClone} disabled={gitLoading || !cloneUrl.trim()}
                        className="h-6 text-[10px] bg-[#89b4fa] hover:bg-[#74c7ec] text-[#1e1e2e]">
                        {gitLoading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Download className="w-3 h-3 mr-1" />}Clone
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setShowClone(false)}
                        className="h-6 text-[10px] text-[#a6adc8] hover:bg-[#313244]">Cancel</Button>
                    </div>
                  </div>
                )}

                {/* Commit message + actions */}
                <div className="px-2 py-2 border-b border-[#313244] space-y-1.5">
                  <textarea
                    placeholder="Commit message…"
                    value={commitMessage}
                    onChange={(e) => setCommitMessage(e.target.value)}
                    rows={2}
                    className="w-full bg-[#1e1e2e] border border-[#313244] rounded px-2 py-1.5 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa] resize-none"
                  />
                  <div className="flex gap-1">
                    <Button size="sm" onClick={gitCommitChanges} disabled={gitLoading || !commitMessage.trim()}
                      className="h-6 text-[10px] flex-1 bg-[#89b4fa] hover:bg-[#74c7ec] text-[#1e1e2e]">
                      <GitCommit className="w-3 h-3 mr-1" />Commit
                    </Button>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={gitPush} disabled={gitLoading}
                      className="h-6 text-[10px] flex-1 text-[#a6adc8] hover:bg-[#313244]">
                      <Upload className="w-3 h-3 mr-1" />Push
                    </Button>
                    <Button size="sm" variant="ghost" onClick={gitPull} disabled={gitLoading}
                      className="h-6 text-[10px] flex-1 text-[#a6adc8] hover:bg-[#313244]">
                      <Download className="w-3 h-3 mr-1" />Pull
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => viewDiff()} disabled={gitLoading}
                      className="h-6 text-[10px] flex-1 text-[#a6adc8] hover:bg-[#313244]">
                      <Eye className="w-3 h-3 mr-1" />Diff
                    </Button>
                  </div>
                </div>

                {/* Staged changes */}
                {stagedFiles.length > 0 && (
                  <div className="border-b border-[#313244]">
                    <div className="flex items-center justify-between px-3 py-1.5">
                      <span className="text-[10px] text-[#a6adc8] uppercase tracking-wider font-semibold">
                        Staged ({stagedFiles.length})
                      </span>
                      <button type="button" onClick={() => gitUnstage(stagedFiles.map(f => f.path))}
                        className="p-0.5 hover:bg-[#313244] rounded" title="Unstage All">
                        <Minus className="w-3 h-3 text-[#a6adc8]" />
                      </button>
                    </div>
                    {stagedFiles.map(f => (
                      <div key={f.path} className="flex items-center gap-1.5 px-3 py-[3px] text-xs hover:bg-[#2a2d3e] group">
                        <span className={`text-[10px] font-mono w-4 text-center ${
                          f.added ? 'text-emerald-400' : f.deleted ? 'text-red-400' : 'text-amber-400'
                        }`}>{f.status[0]}</span>
                        <span className="flex-1 truncate text-[#cdd6f4]">{fileName(f.path)}</span>
                        <button type="button" onClick={() => gitUnstage([f.path])}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#313244] rounded" title="Unstage">
                          <Minus className="w-3 h-3" />
                        </button>
                        <button type="button" onClick={() => viewDiff(f.path, true)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#313244] rounded" title="View Diff">
                          <Eye className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Unstaged / modified changes */}
                {unstagedFiles.length > 0 && (
                  <div className="border-b border-[#313244]">
                    <div className="flex items-center justify-between px-3 py-1.5">
                      <span className="text-[10px] text-[#a6adc8] uppercase tracking-wider font-semibold">
                        Changes ({unstagedFiles.length})
                      </span>
                      <button type="button" onClick={() => gitStage(unstagedFiles.map(f => f.path))}
                        className="p-0.5 hover:bg-[#313244] rounded" title="Stage All">
                        <Plus className="w-3 h-3 text-[#a6adc8]" />
                      </button>
                    </div>
                    {unstagedFiles.map(f => (
                      <div key={f.path} className="flex items-center gap-1.5 px-3 py-[3px] text-xs hover:bg-[#2a2d3e] group">
                        <span className={`text-[10px] font-mono w-4 text-center ${
                          f.untracked ? 'text-emerald-400' : f.deleted ? 'text-red-400' : 'text-amber-400'
                        }`}>{f.untracked ? 'U' : f.deleted ? 'D' : 'M'}</span>
                        <span className="flex-1 truncate text-[#cdd6f4]">{fileName(f.path)}</span>
                        <button type="button" onClick={() => gitStage([f.path])}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#313244] rounded" title="Stage">
                          <Plus className="w-3 h-3" />
                        </button>
                        <button type="button" onClick={() => viewDiff(f.path)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#313244] rounded" title="View Diff">
                          <Eye className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {gitClean && !gitLoading && (
                  <div className="px-3 py-4 text-xs text-[#585b70] text-center">No changes detected</div>
                )}

                {/* Branches */}
                {gitBranches.length > 0 && (
                  <div className="border-b border-[#313244]">
                    <div className="px-3 py-1.5">
                      <span className="text-[10px] text-[#a6adc8] uppercase tracking-wider font-semibold">
                        Branches ({gitBranches.filter(b => !b.remote).length})
                      </span>
                    </div>
                    {gitBranches.filter(b => !b.remote).map(b => (
                      <button type="button" key={b.name}
                        className={`w-full flex items-center gap-1.5 px-3 py-[3px] text-xs text-left hover:bg-[#2a2d3e] ${
                          b.current ? 'text-[#89b4fa]' : 'text-[#cdd6f4]'
                        }`}
                        onClick={() => !b.current && gitCheckout(b.name)}>
                        <GitBranch className="w-3 h-3 shrink-0" />
                        <span className="truncate">{b.name}</span>
                        {b.current && <span className="text-[9px] text-emerald-400 ml-auto">current</span>}
                      </button>
                    ))}
                  </div>
                )}

                {/* Recent commits */}
                {gitCommits.length > 0 && (
                  <div>
                    <div className="px-3 py-1.5">
                      <span className="text-[10px] text-[#a6adc8] uppercase tracking-wider font-semibold">
                        Recent Commits
                      </span>
                    </div>
                    {gitCommits.map(c => (
                      <div key={c.hash} className="px-3 py-[3px] text-xs hover:bg-[#2a2d3e]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[#89b4fa] font-mono text-[10px]">{c.shortHash}</span>
                          <span className="flex-1 truncate text-[#cdd6f4]">{c.message}</span>
                        </div>
                        <div className="text-[10px] text-[#585b70] ml-[46px]">{c.author} · {c.relativeDate}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* ═══ TERMINAL SIDEBAR ═══ */}
          {sidePanel === 'terminal' && (
            <>
              <div className="h-8 flex items-center px-3 text-[10px] text-[#a6adc8] uppercase tracking-wider font-semibold border-b border-[#313244] shrink-0">
                Terminal
              </div>
              <div className="flex-1 flex items-center justify-center text-xs text-[#585b70]">
                Terminal is in the bottom panel
              </div>
            </>
          )}
        </div>

        {/* ── Editor + Terminal Area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tab bar */}
          <div className="h-9 bg-[#181825] border-b border-[#313244] flex items-center overflow-x-auto shrink-0">
            {tabs.length === 0 && (
              <div className="px-3 text-xs text-[#585b70]">Open a file from the explorer</div>
            )}
            {tabs.map(tab => (
              <button type="button" key={tab.path}
                className={`h-full flex items-center gap-1.5 px-3 text-xs border-r border-[#313244] whitespace-nowrap ${
                  tab.path === activeTabPath
                    ? 'bg-[#1e1e2e] text-white border-t-2 border-t-[#89b4fa]'
                    : 'bg-[#181825] text-[#585b70] hover:text-[#a6adc8]'
                }`}
                onClick={() => setActiveTabPath(tab.path)}>
                {getFileIcon({ type: 'file', path: tab.path })}
                <span>{fileName(tab.path)}</span>
                {isDirty(tab) && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
                <span className="ml-1 p-0.5 rounded hover:bg-[#313244]" role="button" tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.path); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); closeTab(tab.path); } }}>
                  <X className="w-3 h-3" />
                </span>
              </button>
            ))}
            {/* Save button for dirty active tab */}
            {activeTab && isDirty(activeTab) && (
              <button type="button" onClick={() => saveFile(activeTab.path)}
                className="h-full px-3 text-xs text-[#89b4fa] hover:bg-[#313244] flex items-center gap-1"
                title="Save (Ctrl+S)">
                <Save className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Editor */}
          <div className={`flex-1 overflow-hidden ${showTerminal ? '' : ''}`}
            style={{ height: showTerminal ? '60%' : '100%' }}>
            {activeTab ? (
              <Editor
                key={activeTab.path}
                height="100%"
                language={activeTab.language}
                value={activeTab.content}
                onChange={handleEditorChange}
                theme="vs-dark"
                options={{
                  minimap: { enabled: true, scale: 1 },
                  fontSize: 13,
                  lineNumbers: 'on',
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: 'on',
                  bracketPairColorization: { enabled: true },
                  renderWhitespace: 'selection',
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  cursorSmoothCaretAnimation: 'on',
                  padding: { top: 8 },
                }}
              />
            ) : showDiff ? (
              <div className="h-full flex flex-col">
                <div className="h-8 bg-[#181825] border-b border-[#313244] flex items-center px-3 shrink-0">
                  <span className="text-xs text-[#a6adc8]">Diff View</span>
                  <div className="flex-1" />
                  <button type="button" onClick={() => setShowDiff(false)}
                    className="p-1 hover:bg-[#313244] rounded"><X className="w-3 h-3 text-[#a6adc8]" /></button>
                </div>
                <div className="flex-1 overflow-auto">
                  <Editor
                    height="100%"
                    language="diff"
                    value={gitDiff}
                    theme="vs-dark"
                    options={{ readOnly: true, minimap: { enabled: false }, lineNumbers: 'off', scrollBeyondLastLine: false, automaticLayout: true }}
                  />
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-[#585b70]">
                <div className="text-center space-y-2">
                  <FileCode2 className="w-12 h-12 mx-auto opacity-30" />
                  <p className="text-sm">Select a file to start editing</p>
                  <p className="text-xs">Use the file explorer or open the IDE in a new tab</p>
                </div>
              </div>
            )}
          </div>

          {/* ── Integrated Terminal ── */}
          {showTerminal && (
            <div className="h-[35%] min-h-[120px] border-t border-[#313244] flex flex-col bg-[#11111b] shrink-0">
              <div className="h-7 bg-[#181825] border-b border-[#313244]/50 flex items-center px-3 shrink-0">
                <span className="text-[10px] text-[#a6adc8] uppercase tracking-wider font-semibold">Terminal</span>
                <div className="flex-1" />
                <button type="button" onClick={() => { setTerminalLines([]); lineIdRef.current = 0; addLine('system', 'Cleared'); }}
                  className="p-0.5 hover:bg-[#313244] rounded mr-1"><RefreshCw className="w-3 h-3 text-[#585b70]" /></button>
                <button type="button" onClick={() => setShowTerminal(false)}
                  className="p-0.5 hover:bg-[#313244] rounded"><X className="w-3 h-3 text-[#585b70]" /></button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-2 font-mono text-xs" onClick={() => terminalInputRef.current?.focus()}>
                {terminalLines.map(line => (
                  <div key={line.id} className={`py-0.5 leading-5 whitespace-pre-wrap break-all ${
                    line.type === 'input' ? 'text-[#89b4fa]' :
                    line.type === 'error' ? 'text-[#f38ba8]' :
                    line.type === 'system' ? 'text-[#6c7086] italic' : 'text-[#cdd6f4]'
                  }`}>{line.text}</div>
                ))}
                <div ref={terminalEndRef} />
              </div>
              <form onSubmit={(e) => { e.preventDefault(); const cmd = terminalInput.trim(); if (cmd) { setTerminalInput(''); execCommand(cmd); } }}
                className="px-3 py-2 border-t border-[#313244]/50 shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[#89b4fa] text-xs font-mono font-bold">$</span>
                  <input ref={terminalInputRef} type="text" value={terminalInput}
                    onChange={(e) => setTerminalInput(e.target.value)}
                    placeholder="type command..." disabled={terminalRunning}
                    className="flex-1 bg-transparent border-none outline-none text-xs font-mono text-[#cdd6f4] placeholder:text-[#45475a]" />
                  {terminalRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" /> : (
                    <button type="submit" disabled={!terminalInput.trim()}
                      className="p-1 rounded hover:bg-[#313244] text-[#585b70] disabled:opacity-30">
                      <CornerDownLeft className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}
        </div>
      </div>

      {/* ── Status Bar ── */}
      <div className="h-6 bg-[#181825] border-t border-[#313244] flex items-center px-3 text-[10px] text-[#585b70] shrink-0">
        <div className="flex items-center gap-1.5">
          <Plug className="w-3 h-3 text-emerald-400" />
          <span className="text-emerald-400">Connected</span>
        </div>
        {gitBranch && (
          <>
            <div className="mx-2 w-px h-3 bg-[#313244]" />
            <GitBranch className="w-3 h-3 mr-1" />
            <span>{gitBranch}</span>
            {!gitClean && <span className="text-amber-400 ml-0.5">({gitFiles.length} changes)</span>}
          </>
        )}
        {activeTab && (
          <>
            <div className="mx-2 w-px h-3 bg-[#313244]" />
            <span>{activeTab.language}</span>
          </>
        )}
        <div className="flex-1" />
        <span>{workstation.host}</span>
        {config && <><div className="mx-2 w-px h-3 bg-[#313244]" /><span>{config.machineType}</span></>}
      </div>
    </div>
  );
}
