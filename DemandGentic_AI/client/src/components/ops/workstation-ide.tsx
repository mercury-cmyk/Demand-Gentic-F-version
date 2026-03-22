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
  reconciling: boolean; env: Record;
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
      ? 
      : ;
  }
  const lang = inferLanguage(entry.path);
  return lang !== 'plaintext'
    ? 
    : ;
}

function buildWorkstationAuthUrl(ideUrl: string, accessToken: string) {
  const u = ideUrl.replace(/\/$/, '');
  return `${u}/_workstation/authenticate?access_token=${encodeURIComponent(accessToken)}&redirect_url=${encodeURIComponent('/')}`;
}
function openLoadingPopup(): Window | null {
  const p = window.open('', '_blank');
  if (!p) return null;
  p.document.write(`Cloud IDEbody{margin:0;font-family:system-ui;background:#1e1e2e;color:#cdd6f4;display:flex;align-items:center;justify-content:center;height:100vh}.l{text-align:center}.s{width:40px;height:40px;border:3px solid #313244;border-top:3px solid #89b4fa;border-radius:50%;animation:r 1s linear infinite;margin:0 auto 16px}@keyframes r{to{transform:rotate(360deg)}}Opening IDE…`);
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
  const [sidePanel, setSidePanel] = useState('files');
  const [sidebarWidth] = useState(260);
  const [showTerminal, setShowTerminal] = useState(false);

  /* ── File browser state ── */
  const [cwd, setCwd] = useState('/home/user');
  const [fileTree, setFileTree] = useState>({});
  const [expandedDirs, setExpandedDirs] = useState>(new Set(['/home/user']));
  const [loadingDirs, setLoadingDirs] = useState>(new Set());

  /* ── Editor state ── */
  const [tabs, setTabs] = useState([]);
  const [activeTabPath, setActiveTabPath] = useState(null);

  /* ── Terminal state ── */
  const [terminalLines, setTerminalLines] = useState([
    { id: 0, type: 'system', text: `Connected to ${workstation.displayName}`, timestamp: new Date() },
  ]);
  const [terminalInput, setTerminalInput] = useState('');
  const [terminalRunning, setTerminalRunning] = useState(false);
  const lineIdRef = useRef(1);
  const terminalEndRef = useRef(null);
  const terminalInputRef = useRef(null);

  /* ── Git state ── */
  const [gitBranch, setGitBranch] = useState('');
  const [gitFiles, setGitFiles] = useState([]);
  const [gitClean, setGitClean] = useState(true);
  const [gitCommits, setGitCommits] = useState([]);
  const [gitBranches, setGitBranches] = useState([]);
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
      const data = await apiJsonRequest(
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
      const data = await apiJsonRequest(
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
      await apiJsonRequest(
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
      const data = await apiJsonRequest(
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
        apiJsonRequest(
          'GET', `${wsGitApi(workstation)}/status?cwd=${encodeURIComponent(cwd)}`,
        ),
        apiJsonRequest(
          'GET', `${wsGitApi(workstation)}/log?cwd=${encodeURIComponent(cwd)}&limit=15`,
        ),
        apiJsonRequest(
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
      const res = await apiJsonRequest(
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
      const res = await apiJsonRequest(
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
      const res = await apiJsonRequest(
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
      const res = await apiJsonRequest(
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
      const res = await apiJsonRequest(
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
      const res = await apiJsonRequest(
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
      const data = await apiJsonRequest('GET', `${wsApi(workstation)}/ide-url`);
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
      return ;
    }
    if (!entries) return null;
    return entries.map((entry) => {
      const fullPath = entry.path;
      const isDir = entry.type === 'directory';
      const isExpanded = expandedDirs.has(fullPath);
      // Skip hidden files starting with . except common ones
      if (entry.name.startsWith('.') && !['..', '.git', '.github', '.env', '.gitignore'].includes(entry.name)) return null;
      return (
        
           isDir ? toggleDir(fullPath) : openFile(fullPath)}
            title={fullPath}
          >
            {isDir ? (
              isExpanded ?  : 
            ) : }
            {getFileIcon(entry, isExpanded)}
            {entry.name}
          
          {isDir && isExpanded && renderFileTree(fullPath, depth + 1)}
        
      );
    });
  };

  return (
    
      {/* ── Top Bar ── */}
      
        
           Back
        
        
        
          
          {workstation.displayName}
          {config && (
            
              {config.machineType}
            
          )}
        

        {/* Git branch */}
        {gitBranch && (
          <>
            
            
              
              {gitBranch}
              {!gitClean && *}
            
          
        )}

        
         setShowTerminal(!showTerminal)}
          className={`h-7 px-2 text-xs ${showTerminal ? 'text-emerald-400' : 'text-[#a6adc8]'} hover:bg-[#313244]`}>
          Terminal
        
        
          {ideOpened ? 'Reopen IDE' : 'Open IDE'}
        
      

      {/* ── Main Area ── */}
      
        {/* ── Activity Bar (left icons) ── */}
        
           setSidePanel('files')} title="Explorer"
            className={`w-10 h-10 flex items-center justify-center rounded-lg ${sidePanel === 'files' ? 'bg-[#313244] text-white' : 'text-[#585b70] hover:text-[#a6adc8]'}`}>
            
          
           setSidePanel('git')} title="Source Control"
            className={`w-10 h-10 flex items-center justify-center rounded-lg relative ${sidePanel === 'git' ? 'bg-[#313244] text-white' : 'text-[#585b70] hover:text-[#a6adc8]'}`}>
            
            {gitFiles.length > 0 && (
              
                {gitFiles.length}
              
            )}
          
           { setSidePanel('terminal'); setShowTerminal(true); }} title="Terminal"
            className={`w-10 h-10 flex items-center justify-center rounded-lg ${sidePanel === 'terminal' ? 'bg-[#313244] text-white' : 'text-[#585b70] hover:text-[#a6adc8]'}`}>
            
          
        

        {/* ── Side Panel ── */}
        

          {/* ═══ FILE EXPLORER ═══ */}
          {sidePanel === 'files' && (
            <>
              
                Explorer
                
                   fetchDirectory(cwd)} className="p-1 hover:bg-[#313244] rounded" title="Refresh">
                    
                  
                
              
              {/* Working directory input */}
              
                
                  
                   setCwd(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { fetchDirectory(cwd); setExpandedDirs(new Set([cwd])); } }}
                    className="flex-1 bg-transparent border-none outline-none text-[10px] text-[#cdd6f4] font-mono"
                    title="Working directory — press Enter to navigate"
                  />
                
              
              
                {renderFileTree(cwd)}
              
            
          )}

          {/* ═══ GIT / SOURCE CONTROL ═══ */}
          {sidePanel === 'git' && (
            <>
              
                Source Control
                
                  
                    
                  
                   setShowClone(!showClone)} className="p-1 hover:bg-[#313244] rounded" title="Clone">
                    
                  
                
              

              
                {/* Clone repo */}
                {showClone && (
                  
                    Clone Repository
                     setCloneUrl(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') gitClone(); }}
                      className="w-full bg-[#1e1e2e] border border-[#313244] rounded px-2 py-1 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa]" />
                    
                      
                        {gitLoading ?  : }Clone
                      
                       setShowClone(false)}
                        className="h-6 text-[10px] text-[#a6adc8] hover:bg-[#313244]">Cancel
                    
                  
                )}

                {/* Commit message + actions */}
                
                   setCommitMessage(e.target.value)}
                    rows={2}
                    className="w-full bg-[#1e1e2e] border border-[#313244] rounded px-2 py-1.5 text-xs text-[#cdd6f4] outline-none focus:border-[#89b4fa] resize-none"
                  />
                  
                    
                      Commit
                    
                  
                  
                    
                      Push
                    
                    
                      Pull
                    
                     viewDiff()} disabled={gitLoading}
                      className="h-6 text-[10px] flex-1 text-[#a6adc8] hover:bg-[#313244]">
                      Diff
                    
                  
                

                {/* Staged changes */}
                {stagedFiles.length > 0 && (
                  
                    
                      
                        Staged ({stagedFiles.length})
                      
                       gitUnstage(stagedFiles.map(f => f.path))}
                        className="p-0.5 hover:bg-[#313244] rounded" title="Unstage All">
                        
                      
                    
                    {stagedFiles.map(f => (
                      
                        {f.status[0]}
                        {fileName(f.path)}
                         gitUnstage([f.path])}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#313244] rounded" title="Unstage">
                          
                        
                         viewDiff(f.path, true)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#313244] rounded" title="View Diff">
                          
                        
                      
                    ))}
                  
                )}

                {/* Unstaged / modified changes */}
                {unstagedFiles.length > 0 && (
                  
                    
                      
                        Changes ({unstagedFiles.length})
                      
                       gitStage(unstagedFiles.map(f => f.path))}
                        className="p-0.5 hover:bg-[#313244] rounded" title="Stage All">
                        
                      
                    
                    {unstagedFiles.map(f => (
                      
                        {f.untracked ? 'U' : f.deleted ? 'D' : 'M'}
                        {fileName(f.path)}
                         gitStage([f.path])}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#313244] rounded" title="Stage">
                          
                        
                         viewDiff(f.path)}
                          className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-[#313244] rounded" title="View Diff">
                          
                        
                      
                    ))}
                  
                )}

                {gitClean && !gitLoading && (
                  No changes detected
                )}

                {/* Branches */}
                {gitBranches.length > 0 && (
                  
                    
                      
                        Branches ({gitBranches.filter(b => !b.remote).length})
                      
                    
                    {gitBranches.filter(b => !b.remote).map(b => (
                       !b.current && gitCheckout(b.name)}>
                        
                        {b.name}
                        {b.current && current}
                      
                    ))}
                  
                )}

                {/* Recent commits */}
                {gitCommits.length > 0 && (
                  
                    
                      
                        Recent Commits
                      
                    
                    {gitCommits.map(c => (
                      
                        
                          {c.shortHash}
                          {c.message}
                        
                        {c.author} · {c.relativeDate}
                      
                    ))}
                  
                )}
              
            
          )}

          {/* ═══ TERMINAL SIDEBAR ═══ */}
          {sidePanel === 'terminal' && (
            <>
              
                Terminal
              
              
                Terminal is in the bottom panel
              
            
          )}
        

        {/* ── Editor + Terminal Area ── */}
        
          {/* Tab bar */}
          
            {tabs.length === 0 && (
              Open a file from the explorer
            )}
            {tabs.map(tab => (
               setActiveTabPath(tab.path)}>
                {getFileIcon({ type: 'file', path: tab.path })}
                {fileName(tab.path)}
                {isDirty(tab) && }
                 { e.stopPropagation(); closeTab(tab.path); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); closeTab(tab.path); } }}>
                  
                
              
            ))}
            {/* Save button for dirty active tab */}
            {activeTab && isDirty(activeTab) && (
               saveFile(activeTab.path)}
                className="h-full px-3 text-xs text-[#89b4fa] hover:bg-[#313244] flex items-center gap-1"
                title="Save (Ctrl+S)">
                
              
            )}
          

          {/* Editor */}
          
            {activeTab ? (
              
            ) : showDiff ? (
              
                
                  Diff View
                  
                   setShowDiff(false)}
                    className="p-1 hover:bg-[#313244] rounded">
                
                
                  
                
              
            ) : (
              
                
                  
                  Select a file to start editing
                  Use the file explorer or open the IDE in a new tab
                
              
            )}
          

          {/* ── Integrated Terminal ── */}
          {showTerminal && (
            
              
                Terminal
                
                 { setTerminalLines([]); lineIdRef.current = 0; addLine('system', 'Cleared'); }}
                  className="p-0.5 hover:bg-[#313244] rounded mr-1">
                 setShowTerminal(false)}
                  className="p-0.5 hover:bg-[#313244] rounded">
              
               terminalInputRef.current?.focus()}>
                {terminalLines.map(line => (
                  {line.text}
                ))}
                
              
               { e.preventDefault(); const cmd = terminalInput.trim(); if (cmd) { setTerminalInput(''); execCommand(cmd); } }}
                className="px-3 py-2 border-t border-[#313244]/50 shrink-0">
                
                  $
                   setTerminalInput(e.target.value)}
                    placeholder="type command..." disabled={terminalRunning}
                    className="flex-1 bg-transparent border-none outline-none text-xs font-mono text-[#cdd6f4] placeholder:text-[#45475a]" />
                  {terminalRunning ?  : (
                    
                      
                    
                  )}
                
              
            
          )}
        
      

      {/* ── Status Bar ── */}
      
        
          
          Connected
        
        {gitBranch && (
          <>
            
            
            {gitBranch}
            {!gitClean && ({gitFiles.length} changes)}
          
        )}
        {activeTab && (
          <>
            
            {activeTab.language}
          
        )}
        
        {workstation.host}
        {config && <>{config.machineType}}
      
    
  );
}