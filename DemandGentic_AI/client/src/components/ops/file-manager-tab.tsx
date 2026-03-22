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
      ? 
      : ;
  }
  const lang = inferLanguage(entry.path);
  if (lang !== 'plaintext') {
    return ;
  }
  return ;
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
  const [treeRoots, setTreeRoots] = useState([]);
  const [expandedPaths, setExpandedPaths] = useState>(new Set(['']));
  const [loadingTree, setLoadingTree] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // ── Tabs state ──
  const [openTabs, setOpenTabs] = useState([]);
  const [activeTabPath, setActiveTabPath] = useState(null);

  // ── File ops state ──
  const [savingFile, setSavingFile] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);

  // ── Context menu ──
  const [contextMenu, setContextMenu] = useState(null);

  // ── Inline rename/create ──
  const [inlineInput, setInlineInput] = useState(null);
  const [inlineValue, setInlineValue] = useState('');
  const inlineRef = useRef(null);

  // ── Folder upload ──
  const folderInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  // ── External update tokens ──
  const [lastExternalToken, setLastExternalToken] = useState(null);
  const [lastRequestedFileToken, setLastRequestedFileToken] = useState(null);

  // ── Current directory for breadcrumbs ──
  const [currentPath, setCurrentPath] = useState('');

  const activeTab = useMemo(
    () => openTabs.find((t) => t.path === activeTabPath) ?? null,
    [openTabs, activeTabPath],
  );

  // ── Directory fetching ─────────────────────────────────────────────────────

  const fetchDirectory = useCallback(async (dirPath: string): Promise => {
    const params = new URLSearchParams();
    if (dirPath) params.set('path', dirPath);
    const data = await apiJsonRequest('GET', `/api/ops/workspace?${params.toString()}`);
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
      const data = await apiJsonRequest('GET', `/api/ops/workspace/file?path=${encodeURIComponent(filePath)}`);
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
      const data = await apiJsonRequest('PUT', '/api/ops/workspace/file', { path: tab.path, content: tab.content });
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

  const handleFolderUpload = useCallback(async (e: React.ChangeEvent) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    setUploading(true);
    try {
      const files: Array = [];
      const binarySkipped: string[] = [];

      for (let i = 0; i 512KB)
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
      for (let i = 0; i (
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
      
         isDir ? toggleExpand(node.path) : openFileInTab(node.path)}
          onContextMenu={(e) => handleContextMenu(e, node as WorkspaceEntry, isDir ? node.path : (node.path.includes('/') ? node.path.substring(0, node.path.lastIndexOf('/')) : ''))}
        >
          {isDir ? (
            
              {node.loading ? (
                
              ) : isExpanded ? (
                
              ) : (
                
              )}
            
          ) : (
            
          )}
          {getFileIcon(node, isExpanded)}
          {node.name}
          {hasUnsaved && }
           { e.stopPropagation(); handleContextMenu(e, node as WorkspaceEntry, isDir ? node.path : (node.path.includes('/') ? node.path.substring(0, node.path.lastIndexOf('/')) : '')); }}
          >
            
          
        

        {showInlineHere && (
          
            {inlineInput.type === 'new-folder' ?  : }
             setInlineValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') commitInlineInput(); if (e.key === 'Escape') setInlineInput(null); }}
              onBlur={commitInlineInput}
              className="flex-1 bg-slate-700 border border-indigo-500 rounded text-xs text-white px-1.5 py-0.5 outline-none"
              placeholder={inlineInput.type === 'new-folder' ? 'folder name...' : 'file name...'}
            />
          
        )}

        {isDir && isExpanded && node.children?.map((child) => renderTreeNode(child, depth + 1))}
      
    );
  };

  // Inline input at root level
  const showRootInline = inlineInput && inlineInput.parentPath === '' && !treeRoots.some((n) => n.type === 'directory' && expandedPaths.has(n.path) && n.path === inlineInput.parentPath);

  // ── Dirty tab count ──
  const dirtyCount = openTabs.filter((t) => t.dirty).length;

  return (
    
      {/* ── VS Code-like layout ── */}
      

        {/* ── Sidebar: File Explorer ── */}
        
          {/* Explorer header */}
          
            Explorer
            
               startNewFile(currentPath)}
                className="p-1 hover:bg-slate-600 rounded transition-colors"
                title="New File"
              >
                
              
               startNewFolder(currentPath)}
                className="p-1 hover:bg-slate-600 rounded transition-colors"
                title="New Folder"
              >
                
              
               folderInputRef.current?.click()}
                className="p-1 hover:bg-slate-600 rounded transition-colors"
                title="Upload Folder"
                disabled={uploading}
              >
                
              
               { setLoadingTree(true); const roots = await loadTreeLevel(''); setTreeRoots(roots); setExpandedPaths(new Set([''])); setLoadingTree(false); }}
                className="p-1 hover:bg-slate-600 rounded transition-colors"
                title="Refresh"
              >
                
              
            
          

          {/* Search */}
          
            
              
               setSearchQuery(e.target.value)}
                className="w-full pl-7 pr-2 py-1 bg-[#3c3c3c] border border-slate-600 rounded text-xs text-white placeholder:text-slate-500 outline-none focus:border-indigo-500 transition-colors"
              />
            
          

          {/* Tree */}
           handleContextMenu(e, null, currentPath)}
          >
            {loadingTree ? (
              Loading workspace...
            ) : visibleRoots.length === 0 ? (
              
                {searchQuery ? 'No matches' : 'Empty workspace'}
              
            ) : (
              <>
                {visibleRoots.map((node) => renderTreeNode(node, 0))}
                {showRootInline && inlineInput && (
                  
                    {inlineInput.type === 'new-folder' ?  : }
                     setInlineValue(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitInlineInput(); if (e.key === 'Escape') setInlineInput(null); }}
                      onBlur={commitInlineInput}
                      className="flex-1 bg-slate-700 border border-indigo-500 rounded text-xs text-white px-1.5 py-0.5 outline-none"
                      placeholder={inlineInput.type === 'new-folder' ? 'folder name...' : 'file name...'}
                    />
                  
                )}
              
            )}
          

          {/* Upload indicator */}
          {uploading && (
            
              
              Uploading folder...
            
          )}
        

        {/* ── Main editor area ── */}
        
          {/* Tab bar */}
          
            {openTabs.map((tab) => (
               {
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
                {fileName(tab.path)}
                {tab.dirty && }
                 { e.stopPropagation(); closeTab(tab.path); }}
                  className="ml-auto p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-600 transition-opacity shrink-0"
                >
                  
                
              
            ))}
            {openTabs.length > 0 && (
              
                {dirtyCount > 0 && (
                  
                    {dirtyCount} unsaved
                  
                )}
              
            )}
          

          {/* Breadcrumb bar */}
          {activeTab && (
            
              {activeTab.path.split('/').map((segment, i, arr) => (
                
                  {i > 0 && }
                  {segment}
                
              ))}
              
                
                  
                  {formatFileSize(activeTab.content.length)}
                
                
                  
                  {formatDate(activeTab.modifiedAt)}
                
                
                  {inferLanguage(activeTab.path)}
                
              
            
          )}

          {/* Editor or welcome */}
          
            {!activeTab ? (
              
                
                Open a file to start editing
                
                  Browse the file tree on the left, or upload a folder from your computer.
                
                
                   folderInputRef.current?.click()}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    
                    Open Folder
                  
                   startNewFile('')}
                    className="border-slate-600 text-slate-300 hover:bg-slate-700"
                  >
                    
                    New File
                  
                
                
                  Ctrl+S to save &middot; Right-click for file actions
                
              
            ) : (
              
            )}
          

          {/* Status bar */}
          
            
              {activeTab ? (
                <>
                  {activeTab.dirty ? 'Modified' : 'Saved'}
                  Ln {activeTab.content.substring(0, activeTab.content.length).split('\n').length}, Col 1
                
              ) : (
                No file open
              )}
            
            
              {activeTab && {inferLanguage(activeTab.path)}}
              UTF-8
              {activeTab?.dirty && (
                 saveFile()} className="hover:underline flex items-center gap-1" disabled={savingFile}>
                  
                  Save
                
              )}
            
          
        
      

      {/* Hidden folder input */}
      

      {/* Context menu */}
      {contextMenu && (
        
           startNewFile(contextMenu.entry?.type === 'directory' ? contextMenu.entry.path : contextMenu.directoryPath)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-600 transition-colors"
          >
             New File
          
           startNewFolder(contextMenu.entry?.type === 'directory' ? contextMenu.entry.path : contextMenu.directoryPath)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-600 transition-colors"
          >
             New Folder
          
          {contextMenu.entry && (
            <>
              
               contextMenu.entry && startRename(contextMenu.entry)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-600 transition-colors"
              >
                 Rename
              
               contextMenu.entry && handleDelete(contextMenu.entry)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
              >
                 Delete
              
            
          )}
          
           { setContextMenu(null); folderInputRef.current?.click(); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-600 transition-colors"
          >
             Upload Folder
          
        
      )}
    
  );
}