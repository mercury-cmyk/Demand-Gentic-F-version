import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  FolderOpen,
  FolderClosed,
  File,
  FileCode2,
  RefreshCw,
  Search,
  ChevronRight,
  ChevronDown,
  Save,
  FileText,
  Clock3,
  PencilLine,
  Plus,
  FolderPlus,
  FilePlus,
  Trash2,
  Upload,
  X,
  MoreVertical,
  Pencil,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiJsonRequest } from '@/lib/queryClient';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkspaceEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
}

export interface WorkspaceDirectoryResponse {
  currentPath: string;
  breadcrumbs: string[];
  entries: WorkspaceEntry[];
}

export interface WorkspaceFileResponse {
  path: string;
  content: string;
  size: number;
  modifiedAt: string;
}

export interface OpsWorkspaceFileContext {
  path: string;
  content: string;
  modifiedAt?: string;
  dirty: boolean;
}

interface ExternalFileUpdate {
  path: string;
  content: string;
  modifiedAt?: string;
  token: number;
}

interface FileManagerTabProps {
  onFileContextChange?: (file: OpsWorkspaceFileContext | null) => void;
  externalFileUpdate?: ExternalFileUpdate | null;
  requestedFilePath?: string;
  requestedFileToken?: number;
}

interface OpenTab {
  path: string;
  content: string;
  originalContent: string;
  modifiedAt?: string;
  dirty: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modifiedAt: string;
  children?: TreeNode[];
  loaded?: boolean;
  loading?: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  entry: WorkspaceEntry | null;
  /** directory path when right-clicking empty area */
  directoryPath: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const value = new Date(dateStr);
  if (Number.isNaN(value.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(value);
}

function formatFileSize(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, index);
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function inferLanguage(filePath: string): string {
  const extension = filePath.split('.').pop()?.toLowerCase();
  switch (extension) {
    case 'ts': case 'tsx': return 'typescript';
    case 'js': case 'jsx': case 'mjs': case 'cjs': return 'javascript';
    case 'json': return 'json';
    case 'css': return 'css';
    case 'scss': return 'scss';
    case 'html': return 'html';
    case 'md': return 'markdown';
    case 'sh': case 'bash': return 'shell';
    case 'yml': case 'yaml': return 'yaml';
    case 'sql': return 'sql';
    case 'py': return 'python';
    case 'go': return 'go';
    case 'rs': return 'rust';
    case 'dockerfile': return 'dockerfile';
    case 'xml': return 'xml';
    case 'svg': return 'xml';
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
  if (lang !== 'plaintext') {
    return <FileCode2 className="w-4 h-4 text-sky-400 shrink-0" />;
  }
  return <File className="w-4 h-4 text-slate-400 shrink-0" />;
}

function fileName(path: string): string {
  return path.split('/').pop() || path;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FileManagerTab({
  onFileContextChange,
  externalFileUpdate,
  requestedFilePath,
  requestedFileToken,
}: FileManagerTabProps) {
  const { toast } = useToast();

  // ── Tree state ──
  const [treeRoots, setTreeRoots] = useState<TreeNode[]>([]);
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set(['']));
  const [loadingTree, setLoadingTree] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Tabs state ──
  const [openTabs, setOpenTabs] = useState<OpenTab[]>([]);
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null);

  // ── File ops state ──
  const [savingFile, setSavingFile] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);

  // ── Context menu ──
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // ── Inline rename/create ──
  const [inlineInput, setInlineInput] = useState<{
    parentPath: string;
    type: 'new-file' | 'new-folder' | 'rename';
    currentName?: string;
    currentPath?: string;
  } | null>(null);
  const [inlineValue, setInlineValue] = useState('');
  const inlineRef = useRef<HTMLInputElement>(null);

  // ── Folder upload ──
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // ── External update tokens ──
  const [lastExternalToken, setLastExternalToken] = useState<number | null>(null);
  const [lastRequestedFileToken, setLastRequestedFileToken] = useState<number | null>(null);

  // ── Current directory for breadcrumbs ──
  const [currentPath, setCurrentPath] = useState('');

  const activeTab = useMemo(
    () => openTabs.find((t) => t.path === activeTabPath) ?? null,
    [openTabs, activeTabPath],
  );

  // ── Directory fetching ─────────────────────────────────────────────────────

  const fetchDirectory = useCallback(async (dirPath: string): Promise<WorkspaceEntry[]> => {
    const params = new URLSearchParams();
    if (dirPath) params.set('path', dirPath);
    const data = await apiJsonRequest<{
      success: boolean;
      directory: WorkspaceDirectoryResponse;
      error?: string;
    }>('GET', `/api/ops/workspace?${params.toString()}`);
    if (!data.success) throw new Error(data.error || 'Failed to load directory');
    return data.directory.entries;
  }, []);

  const loadTreeLevel = useCallback(async (dirPath: string) => {
    try {
      const entries = await fetchDirectory(dirPath);
      const nodes: TreeNode[] = entries.map((e) => ({
        ...e,
        children: e.type === 'directory' ? [] : undefined,
        loaded: e.type !== 'directory',
      }));
      return nodes;
    } catch (error) {
      toast({
        title: 'Workspace unavailable',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
      return [];
    }
  }, [fetchDirectory, toast]);

  // Load root on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingTree(true);
    loadTreeLevel('').then((nodes) => {
      if (!cancelled) {
        setTreeRoots(nodes);
        setLoadingTree(false);
      }
    });
    return () => { cancelled = true; };
  }, [loadTreeLevel]);

  // ── Tree expansion ─────────────────────────────────────────────────────────

  const updateNodeChildren = useCallback(
    (roots: TreeNode[], targetPath: string, children: TreeNode[]): TreeNode[] => {
      return roots.map((node) => {
        if (node.path === targetPath) {
          return { ...node, children, loaded: true, loading: false };
        }
        if (node.children && targetPath.startsWith(node.path + '/')) {
          return { ...node, children: updateNodeChildren(node.children, targetPath, children) };
        }
        return node;
      });
    },
    [],
  );

  const toggleExpand = useCallback(async (nodePath: string) => {
    const next = new Set(expandedPaths);
    if (next.has(nodePath)) {
      next.delete(nodePath);
      setExpandedPaths(next);
      return;
    }

    next.add(nodePath);
    setExpandedPaths(next);

    // Load children if not loaded
    setTreeRoots((prev) =>
      prev.map((node) => markLoading(node, nodePath)),
    );

    const children = await loadTreeLevel(nodePath);
    setTreeRoots((prev) => updateNodeChildren(prev, nodePath, children));
  }, [expandedPaths, loadTreeLevel, updateNodeChildren]);

  function markLoading(node: TreeNode, targetPath: string): TreeNode {
    if (node.path === targetPath) return { ...node, loading: true };
    if (node.children && targetPath.startsWith(node.path + '/')) {
      return { ...node, children: node.children.map((c) => markLoading(c, targetPath)) };
    }
    return node;
  }

  // ── Refresh a specific directory in the tree ──
  const refreshTreeDir = useCallback(async (dirPath: string) => {
    const children = await loadTreeLevel(dirPath);
    if (dirPath === '') {
      setTreeRoots(children);
    } else {
      setTreeRoots((prev) => updateNodeChildren(prev, dirPath, children));
    }
  }, [loadTreeLevel, updateNodeChildren]);

  // ── File opening ───────────────────────────────────────────────────────────

  const openFileInTab = useCallback(async (filePath: string) => {
    // If already open, just switch to it
    const existing = openTabs.find((t) => t.path === filePath);
    if (existing) {
      setActiveTabPath(filePath);
      onFileContextChange?.({ path: existing.path, content: existing.content, modifiedAt: existing.modifiedAt, dirty: existing.dirty });
      return;
    }

    setLoadingFile(true);
    try {
      const data = await apiJsonRequest<{
        success: boolean;
        file: WorkspaceFileResponse;
        error?: string;
      }>('GET', `/api/ops/workspace/file?path=${encodeURIComponent(filePath)}`);
      if (!data.success) throw new Error(data.error || 'Failed to open file');

      const newTab: OpenTab = {
        path: data.file.path,
        content: data.file.content,
        originalContent: data.file.content,
        modifiedAt: data.file.modifiedAt,
        dirty: false,
      };

      setOpenTabs((prev) => [...prev, newTab]);
      setActiveTabPath(data.file.path);
      onFileContextChange?.({ path: newTab.path, content: newTab.content, modifiedAt: newTab.modifiedAt, dirty: false });
    } catch (error) {
      toast({
        title: 'Could not open file',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setLoadingFile(false);
    }
  }, [onFileContextChange, openTabs, toast]);

  // ── Close tab ──
  const closeTab = useCallback((tabPath: string) => {
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t.path !== tabPath);
      if (activeTabPath === tabPath) {
        const idx = prev.findIndex((t) => t.path === tabPath);
        const nextActive = next[Math.min(idx, next.length - 1)]?.path ?? null;
        setActiveTabPath(nextActive);
        const nextTab = next.find((t) => t.path === nextActive);
        onFileContextChange?.(nextTab ? { path: nextTab.path, content: nextTab.content, modifiedAt: nextTab.modifiedAt, dirty: nextTab.dirty } : null);
      }
      return next;
    });
  }, [activeTabPath, onFileContextChange]);

  // ── Save file ──────────────────────────────────────────────────────────────

  const saveFile = useCallback(async (tabPath?: string) => {
    const targetPath = tabPath || activeTabPath;
    const tab = openTabs.find((t) => t.path === targetPath);
    if (!tab || !tab.dirty) return;

    setSavingFile(true);
    try {
      const data = await apiJsonRequest<{
        success: boolean;
        file: WorkspaceFileResponse;
        error?: string;
      }>('PUT', '/api/ops/workspace/file', { path: tab.path, content: tab.content });
      if (!data.success) throw new Error(data.error || 'Failed to save file');

      setOpenTabs((prev) =>
        prev.map((t) =>
          t.path === tab.path
            ? { ...t, content: data.file.content, originalContent: data.file.content, modifiedAt: data.file.modifiedAt, dirty: false }
            : t,
        ),
      );
      if (tab.path === activeTabPath) {
        onFileContextChange?.({ path: data.file.path, content: data.file.content, modifiedAt: data.file.modifiedAt, dirty: false });
      }
      toast({ title: 'Saved', description: tab.path });
    } catch (error) {
      toast({ title: 'Save failed', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally {
      setSavingFile(false);
    }
  }, [activeTabPath, onFileContextChange, openTabs, toast]);

  // ── Keyboard shortcut: Ctrl+S ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveFile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveFile]);

  // ── Editor change ──────────────────────────────────────────────────────────

  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!activeTabPath) return;
    setOpenTabs((prev) =>
      prev.map((t) => {
        if (t.path !== activeTabPath) return t;
        const newContent = value ?? '';
        const dirty = newContent !== t.originalContent;
        return { ...t, content: newContent, dirty };
      }),
    );
    // Update context
    const tab = openTabs.find((t) => t.path === activeTabPath);
    if (tab) {
      const newContent = value ?? '';
      onFileContextChange?.({ path: tab.path, content: newContent, modifiedAt: tab.modifiedAt, dirty: newContent !== tab.originalContent });
    }
  }, [activeTabPath, onFileContextChange, openTabs]);

  // ── External file updates (from coding agent) ─────────────────────────────

  useEffect(() => {
    if (!externalFileUpdate || externalFileUpdate.token === lastExternalToken) return;
    setLastExternalToken(externalFileUpdate.token);

    setOpenTabs((prev) =>
      prev.map((t) => {
        if (t.path !== externalFileUpdate.path) return t;
        return {
          ...t,
          content: externalFileUpdate.content,
          originalContent: externalFileUpdate.content,
          modifiedAt: externalFileUpdate.modifiedAt,
          dirty: false,
        };
      }),
    );

    if (activeTabPath === externalFileUpdate.path) {
      onFileContextChange?.({
        path: externalFileUpdate.path,
        content: externalFileUpdate.content,
        modifiedAt: externalFileUpdate.modifiedAt,
        dirty: false,
      });
    }
  }, [externalFileUpdate, lastExternalToken, activeTabPath, onFileContextChange]);

  // ── Requested file path (from side panel) ──
  useEffect(() => {
    if (!requestedFilePath || requestedFileToken == null || requestedFileToken === lastRequestedFileToken) return;
    setLastRequestedFileToken(requestedFileToken);
    void openFileInTab(requestedFilePath);
  }, [lastRequestedFileToken, openFileInTab, requestedFilePath, requestedFileToken]);

  // ── Context menu actions ───────────────────────────────────────────────────

  const handleContextMenu = useCallback((e: React.MouseEvent, entry: WorkspaceEntry | null, dirPath: string) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, entry, directoryPath: dirPath });
  }, []);

  useEffect(() => {
    const close = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener('click', close);
      return () => window.removeEventListener('click', close);
    }
  }, [contextMenu]);

  const startNewFile = (parentPath: string) => {
    setContextMenu(null);
    setInlineInput({ parentPath, type: 'new-file' });
    setInlineValue('');
    setTimeout(() => inlineRef.current?.focus(), 50);
  };

  const startNewFolder = (parentPath: string) => {
    setContextMenu(null);
    setInlineInput({ parentPath, type: 'new-folder' });
    setInlineValue('');
    setTimeout(() => inlineRef.current?.focus(), 50);
  };

  const startRename = (entry: WorkspaceEntry) => {
    setContextMenu(null);
    const parentPath = entry.path.includes('/') ? entry.path.substring(0, entry.path.lastIndexOf('/')) : '';
    setInlineInput({ parentPath, type: 'rename', currentName: entry.name, currentPath: entry.path });
    setInlineValue(entry.name);
    setTimeout(() => inlineRef.current?.focus(), 50);
  };

  const handleDelete = async (entry: WorkspaceEntry) => {
    setContextMenu(null);
    if (!window.confirm(`Delete "${entry.name}"? This cannot be undone.`)) return;
    try {
      await apiJsonRequest('DELETE', `/api/ops/workspace/entry?path=${encodeURIComponent(entry.path)}`);
      toast({ title: 'Deleted', description: entry.path });
      // Close tab if open
      if (openTabs.some((t) => t.path === entry.path)) {
        closeTab(entry.path);
      }
      // Refresh parent
      const parentPath = entry.path.includes('/') ? entry.path.substring(0, entry.path.lastIndexOf('/')) : '';
      await refreshTreeDir(parentPath);
    } catch (error) {
      toast({ title: 'Delete failed', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    }
  };

  const commitInlineInput = async () => {
    if (!inlineInput || !inlineValue.trim()) {
      setInlineInput(null);
      return;
    }

    const name = inlineValue.trim();
    const parentPath = inlineInput.parentPath;
    const fullPath = parentPath ? `${parentPath}/${name}` : name;

    try {
      if (inlineInput.type === 'new-file') {
        await apiJsonRequest('PUT', '/api/ops/workspace/file', { path: fullPath, content: '' });
        toast({ title: 'File created', description: fullPath });
        await refreshTreeDir(parentPath);
        void openFileInTab(fullPath);
      } else if (inlineInput.type === 'new-folder') {
        await apiJsonRequest('POST', '/api/ops/workspace/folder', { path: fullPath });
        toast({ title: 'Folder created', description: fullPath });
        await refreshTreeDir(parentPath);
        // Auto-expand
        setExpandedPaths((prev) => new Set([...prev, fullPath]));
      } else if (inlineInput.type === 'rename' && inlineInput.currentPath) {
        const newFullPath = parentPath ? `${parentPath}/${name}` : name;
        await apiJsonRequest('POST', '/api/ops/workspace/rename', { oldPath: inlineInput.currentPath, newPath: newFullPath });
        toast({ title: 'Renamed', description: `${inlineInput.currentName} → ${name}` });
        // Update open tabs
        setOpenTabs((prev) =>
          prev.map((t) => t.path === inlineInput.currentPath ? { ...t, path: newFullPath } : t),
        );
        if (activeTabPath === inlineInput.currentPath) setActiveTabPath(newFullPath);
        await refreshTreeDir(parentPath);
      }
    } catch (error) {
      toast({ title: 'Operation failed', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    }

    setInlineInput(null);
  };

  // ── Folder upload ──────────────────────────────────────────────────────────

  const handleFolderUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setUploading(true);
    try {
      const files: Array<{ path: string; content: string }> = [];
      const binarySkipped: string[] = [];

      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const relativePath = (file as any).webkitRelativePath || file.name;

        // Skip common non-text dirs
        if (/\/(node_modules|\.git|dist|\.venv)\//i.test(relativePath)) continue;
        // Skip large files (>512KB)
        if (file.size > 512 * 1024) continue;

        try {
          const text = await file.text();
          // Skip binary
          if (text.includes('\0')) {
            binarySkipped.push(relativePath);
            continue;
          }
          files.push({ path: relativePath, content: text });
        } catch {
          binarySkipped.push(relativePath);
        }
      }

      if (files.length === 0) {
        toast({ title: 'No files to upload', description: 'All files were binary or too large.', variant: 'destructive' });
        return;
      }

      // Upload in batches of 100
      let totalWritten = 0;
      for (let i = 0; i < files.length; i += 100) {
        const batch = files.slice(i, i + 100);
        const data = await apiJsonRequest<{ success: boolean; written: number; error?: string }>(
          'POST',
          '/api/ops/workspace/upload',
          { files: batch },
        );
        if (!data.success) throw new Error(data.error || 'Upload failed');
        totalWritten += data.written;
      }

      toast({
        title: 'Folder uploaded',
        description: `${totalWritten} files uploaded${binarySkipped.length ? `, ${binarySkipped.length} binary files skipped` : ''}`,
      });

      // Refresh root tree
      const roots = await loadTreeLevel('');
      setTreeRoots(roots);
      setExpandedPaths(new Set(['']));
    } catch (error) {
      toast({ title: 'Upload failed', description: error instanceof Error ? error.message : String(error), variant: 'destructive' });
    } finally {
      setUploading(false);
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  }, [loadTreeLevel, toast]);

  // ── Search filter for tree ─────────────────────────────────────────────────

  const filterTree = useCallback((nodes: TreeNode[], query: string): TreeNode[] => {
    if (!query) return nodes;
    const lq = query.toLowerCase();
    return nodes.filter((n) => {
      if (n.name.toLowerCase().includes(lq)) return true;
      if (n.children) return filterTree(n.children, query).length > 0;
      return false;
    });
  }, []);

  const visibleRoots = useMemo(
    () => filterTree(treeRoots, searchQuery.trim()),
    [filterTree, treeRoots, searchQuery],
  );

  // ── Render tree node ───────────────────────────────────────────────────────

  const renderTreeNode = (node: TreeNode, depth: number) => {
    const isDir = node.type === 'directory';
    const isExpanded = expandedPaths.has(node.path);
    const isActive = activeTabPath === node.path;
    const hasUnsaved = openTabs.some((t) => t.path === node.path && t.dirty);

    // Check if inline input should show under this directory
    const showInlineHere = inlineInput && inlineInput.parentPath === node.path && isDir && isExpanded;

    return (
      <React.Fragment key={node.path}>
        <div
          className={`flex items-center gap-1 py-[3px] pr-2 cursor-pointer select-none text-[13px] transition-colors group ${
            isActive ? 'bg-indigo-500/15 text-white' : 'text-slate-300 hover:bg-slate-700/50'
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
          onClick={() => isDir ? toggleExpand(node.path) : openFileInTab(node.path)}
          onContextMenu={(e) => handleContextMenu(e, node as WorkspaceEntry, isDir ? node.path : (node.path.includes('/') ? node.path.substring(0, node.path.lastIndexOf('/')) : ''))}
        >
          {isDir ? (
            <span className="w-4 h-4 flex items-center justify-center shrink-0">
              {node.loading ? (
                <RefreshCw className="w-3 h-3 animate-spin text-slate-500" />
              ) : isExpanded ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
              )}
            </span>
          ) : (
            <span className="w-4 h-4 shrink-0" />
          )}
          {getFileIcon(node, isExpanded)}
          <span className="truncate flex-1 ml-1">{node.name}</span>
          {hasUnsaved && <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />}
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-600 rounded shrink-0 transition-opacity"
            onClick={(e) => { e.stopPropagation(); handleContextMenu(e, node as WorkspaceEntry, isDir ? node.path : (node.path.includes('/') ? node.path.substring(0, node.path.lastIndexOf('/')) : '')); }}
          >
            <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
          </button>
        </div>

        {showInlineHere && (
          <div className="flex items-center gap-1 py-1" style={{ paddingLeft: `${12 + (depth + 1) * 16}px` }}>
            {inlineInput.type === 'new-folder' ? <FolderPlus className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : <FilePlus className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
            <input
              ref={inlineRef}
              value={inlineValue}
              onChange={(e) => setInlineValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitInlineInput(); if (e.key === 'Escape') setInlineInput(null); }}
              onBlur={commitInlineInput}
              className="flex-1 bg-slate-700 border border-indigo-500 rounded text-xs text-white px-1.5 py-0.5 outline-none"
              placeholder={inlineInput.type === 'new-folder' ? 'folder name...' : 'file name...'}
            />
          </div>
        )}

        {isDir && isExpanded && node.children?.map((child) => renderTreeNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  // Inline input at root level
  const showRootInline = inlineInput && inlineInput.parentPath === '' && !treeRoots.some((n) => n.type === 'directory' && expandedPaths.has(n.path) && n.path === inlineInput.parentPath);

  // ── Dirty tab count ──
  const dirtyCount = openTabs.filter((t) => t.dirty).length;

  return (
    <div className="flex flex-col h-[calc(100vh-180px)] min-h-[600px]">
      {/* ── VS Code-like layout ── */}
      <div className="flex flex-1 overflow-hidden rounded-xl border border-slate-200 bg-[#1e1e1e]">

        {/* ── Sidebar: File Explorer ── */}
        <div className="w-[280px] shrink-0 border-r border-slate-700 flex flex-col bg-[#252526]">
          {/* Explorer header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Explorer</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => startNewFile(currentPath)}
                className="p-1 hover:bg-slate-600 rounded transition-colors"
                title="New File"
              >
                <FilePlus className="w-3.5 h-3.5 text-slate-400" />
              </button>
              <button
                onClick={() => startNewFolder(currentPath)}
                className="p-1 hover:bg-slate-600 rounded transition-colors"
                title="New Folder"
              >
                <FolderPlus className="w-3.5 h-3.5 text-slate-400" />
              </button>
              <button
                onClick={() => folderInputRef.current?.click()}
                className="p-1 hover:bg-slate-600 rounded transition-colors"
                title="Upload Folder"
                disabled={uploading}
              >
                <Upload className={`w-3.5 h-3.5 text-slate-400 ${uploading ? 'animate-pulse' : ''}`} />
              </button>
              <button
                onClick={async () => { setLoadingTree(true); const roots = await loadTreeLevel(''); setTreeRoots(roots); setExpandedPaths(new Set([''])); setLoadingTree(false); }}
                className="p-1 hover:bg-slate-600 rounded transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loadingTree ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="px-2 py-1.5">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                placeholder="Search files..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-2 py-1 bg-[#3c3c3c] border border-slate-600 rounded text-xs text-white placeholder:text-slate-500 outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
          </div>

          {/* Tree */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden"
            onContextMenu={(e) => handleContextMenu(e, null, currentPath)}
          >
            {loadingTree ? (
              <div className="px-4 py-10 text-center text-slate-500 text-xs">Loading workspace...</div>
            ) : visibleRoots.length === 0 ? (
              <div className="px-4 py-10 text-center text-slate-500 text-xs">
                {searchQuery ? 'No matches' : 'Empty workspace'}
              </div>
            ) : (
              <>
                {visibleRoots.map((node) => renderTreeNode(node, 0))}
                {showRootInline && inlineInput && (
                  <div className="flex items-center gap-1 py-1 px-3">
                    {inlineInput.type === 'new-folder' ? <FolderPlus className="w-3.5 h-3.5 text-amber-400 shrink-0" /> : <FilePlus className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                    <input
                      ref={inlineRef}
                      value={inlineValue}
                      onChange={(e) => setInlineValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitInlineInput(); if (e.key === 'Escape') setInlineInput(null); }}
                      onBlur={commitInlineInput}
                      className="flex-1 bg-slate-700 border border-indigo-500 rounded text-xs text-white px-1.5 py-0.5 outline-none"
                      placeholder={inlineInput.type === 'new-folder' ? 'folder name...' : 'file name...'}
                    />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Upload indicator */}
          {uploading && (
            <div className="px-3 py-2 border-t border-slate-700 text-xs text-indigo-300 flex items-center gap-2">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Uploading folder...
            </div>
          )}
        </div>

        {/* ── Main editor area ── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Tab bar */}
          <div className="flex items-center border-b border-slate-700 bg-[#252526] overflow-x-auto shrink-0">
            {openTabs.map((tab) => (
              <div
                key={tab.path}
                onClick={() => {
                  setActiveTabPath(tab.path);
                  onFileContextChange?.({ path: tab.path, content: tab.content, modifiedAt: tab.modifiedAt, dirty: tab.dirty });
                }}
                className={`group flex items-center gap-1.5 px-3 py-1.5 text-[12px] border-r border-slate-700 cursor-pointer select-none shrink-0 max-w-[200px] ${
                  activeTabPath === tab.path
                    ? 'bg-[#1e1e1e] text-white border-t-2 border-t-indigo-500'
                    : 'bg-[#2d2d2d] text-slate-400 hover:bg-[#2a2a2a] border-t-2 border-t-transparent'
                }`}
              >
                {getFileIcon({ type: 'file', path: tab.path })}
                <span className="truncate">{fileName(tab.path)}</span>
                {tab.dirty && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />}
                <button
                  onClick={(e) => { e.stopPropagation(); closeTab(tab.path); }}
                  className="ml-auto p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-600 transition-opacity shrink-0"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {openTabs.length > 0 && (
              <div className="ml-auto flex items-center gap-1 px-2 shrink-0">
                {dirtyCount > 0 && (
                  <Badge className="bg-amber-500/20 text-amber-300 text-[10px] px-1.5 py-0">
                    {dirtyCount} unsaved
                  </Badge>
                )}
              </div>
            )}
          </div>

          {/* Breadcrumb bar */}
          {activeTab && (
            <div className="flex items-center gap-1 px-3 py-1 bg-[#252526] border-b border-slate-700 text-[11px] text-slate-400 shrink-0">
              {activeTab.path.split('/').map((segment, i, arr) => (
                <React.Fragment key={i}>
                  {i > 0 && <ChevronRight className="w-3 h-3 text-slate-600" />}
                  <span className={i === arr.length - 1 ? 'text-slate-200' : ''}>{segment}</span>
                </React.Fragment>
              ))}
              <div className="ml-auto flex items-center gap-3 text-slate-500">
                <span className="inline-flex items-center gap-1">
                  <FileText className="w-3 h-3" />
                  {formatFileSize(activeTab.content.length)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock3 className="w-3 h-3" />
                  {formatDate(activeTab.modifiedAt)}
                </span>
                <Badge variant="outline" className="border-slate-600 text-slate-400 text-[10px] px-1.5 py-0">
                  {inferLanguage(activeTab.path)}
                </Badge>
              </div>
            </div>
          )}

          {/* Editor or welcome */}
          <div className="flex-1 relative">
            {!activeTab ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
                <PencilLine className="w-12 h-12 text-slate-600 mb-4" />
                <p className="text-slate-300 font-medium text-lg">Open a file to start editing</p>
                <p className="text-sm text-slate-500 mt-2 max-w-md">
                  Browse the file tree on the left, or upload a folder from your computer.
                </p>
                <div className="flex items-center gap-3 mt-6">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => folderInputRef.current?.click()}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Open Folder
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => startNewFile('')}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    <FilePlus className="w-4 h-4 mr-2" />
                    New File
                  </Button>
                </div>
                <div className="mt-8 text-xs text-slate-600 space-y-1">
                  <p>Ctrl+S to save &middot; Right-click for file actions</p>
                </div>
              </div>
            ) : (
              <Editor
                key={activeTab.path}
                height="100%"
                language={inferLanguage(activeTab.path)}
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
            )}
          </div>

          {/* Status bar */}
          <div className="flex items-center justify-between px-3 py-1 bg-[#007acc] text-white text-[11px] shrink-0">
            <div className="flex items-center gap-3">
              {activeTab ? (
                <>
                  <span>{activeTab.dirty ? 'Modified' : 'Saved'}</span>
                  <span>Ln {activeTab.content.substring(0, activeTab.content.length).split('\n').length}, Col 1</span>
                </>
              ) : (
                <span>No file open</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {activeTab && <span>{inferLanguage(activeTab.path)}</span>}
              <span>UTF-8</span>
              {activeTab?.dirty && (
                <button onClick={() => saveFile()} className="hover:underline flex items-center gap-1" disabled={savingFile}>
                  <Save className={`w-3 h-3 ${savingFile ? 'animate-pulse' : ''}`} />
                  Save
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden folder input */}
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        {...({ webkitdirectory: 'true', directory: 'true', mozdirectory: 'true' } as any)}
        multiple
        onChange={handleFolderUpload}
      />

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-[100] bg-[#252526] border border-slate-600 rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          <button
            onClick={() => startNewFile(contextMenu.entry?.type === 'directory' ? contextMenu.entry.path : contextMenu.directoryPath)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-600 transition-colors"
          >
            <FilePlus className="w-3.5 h-3.5" /> New File
          </button>
          <button
            onClick={() => startNewFolder(contextMenu.entry?.type === 'directory' ? contextMenu.entry.path : contextMenu.directoryPath)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-600 transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5" /> New Folder
          </button>
          {contextMenu.entry && (
            <>
              <div className="border-t border-slate-700 my-1" />
              <button
                onClick={() => contextMenu.entry && startRename(contextMenu.entry)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-600 transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Rename
              </button>
              <button
                onClick={() => contextMenu.entry && handleDelete(contextMenu.entry)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            </>
          )}
          <div className="border-t border-slate-700 my-1" />
          <button
            onClick={() => { setContextMenu(null); folderInputRef.current?.click(); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-600 transition-colors"
          >
            <Upload className="w-3.5 h-3.5" /> Upload Folder
          </button>
        </div>
      )}
    </div>
  );
}
