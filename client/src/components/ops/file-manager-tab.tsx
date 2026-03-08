import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Editor from '@monaco-editor/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  FolderOpen,
  File,
  FileCode2,
  RefreshCw,
  Search,
  ChevronRight,
  FolderUp,
  Save,
  FileText,
  Clock3,
  PencilLine,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiJsonRequest } from '@/lib/queryClient';

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
  requestedFilePath?: string | null;
  requestedFileToken?: number;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '-';
  const value = new Date(dateStr);
  if (Number.isNaN(value.getTime())) return '-';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
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
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'javascript';
    case 'json':
      return 'json';
    case 'css':
      return 'css';
    case 'html':
      return 'html';
    case 'md':
      return 'markdown';
    case 'sh':
    case 'bash':
      return 'shell';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'sql':
      return 'sql';
    default:
      return 'plaintext';
  }
}

function getEntryIcon(entry: WorkspaceEntry) {
  if (entry.type === 'directory') {
    return <FolderOpen className="w-4 h-4 text-amber-400" />;
  }

  const language = inferLanguage(entry.path);
  if (language !== 'plaintext') {
    return <FileCode2 className="w-4 h-4 text-cyan-400" />;
  }

  return <File className="w-4 h-4 text-slate-400" />;
}

export default function FileManagerTab({
  onFileContextChange,
  externalFileUpdate,
  requestedFilePath,
  requestedFileToken,
}: FileManagerTabProps) {
  const { toast } = useToast();
  const [directory, setDirectory] = useState<WorkspaceDirectoryResponse>({
    currentPath: '',
    breadcrumbs: [],
    entries: [],
  });
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [loadingFile, setLoadingFile] = useState(false);
  const [savingFile, setSavingFile] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [openFile, setOpenFile] = useState<OpsWorkspaceFileContext | null>(null);
  const [openFileSize, setOpenFileSize] = useState(0);
  const [lastExternalToken, setLastExternalToken] = useState<number | null>(null);
  const [lastRequestedFileToken, setLastRequestedFileToken] = useState<number | null>(null);

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

      const nextFile: OpsWorkspaceFileContext = {
        path: data.file.path,
        content: data.file.content,
        modifiedAt: data.file.modifiedAt,
        dirty: false,
      };
      setOpenFile(nextFile);
      setOpenFileSize(data.file.size || 0);
      onFileContextChange?.(nextFile);
    } catch (error) {
      toast({
        title: 'Could not open file',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setLoadingFile(false);
    }
  }, [onFileContextChange, toast]);

  const saveWorkspaceFile = useCallback(async () => {
    if (!openFile) return;

    setSavingFile(true);
    try {
      const data = await apiJsonRequest<{
        success: boolean;
        file: WorkspaceFileResponse;
        error?: string;
      }>('PUT', '/api/ops/workspace/file', {
          path: openFile.path,
          content: openFile.content,
        });
      if (!data.success) {
        throw new Error(data.error || 'Failed to save file');
      }

      const nextFile: OpsWorkspaceFileContext = {
        path: data.file.path,
        content: data.file.content,
        modifiedAt: data.file.modifiedAt,
        dirty: false,
      };
      setOpenFile(nextFile);
      setOpenFileSize(data.file.size || openFile.content.length);
      onFileContextChange?.(nextFile);
      toast({
        title: 'File saved',
        description: data.file.path,
      });
      fetchDirectory(directory.currentPath);
    } catch (error) {
      toast({
        title: 'Save failed',
        description: error instanceof Error ? error.message : String(error),
        variant: 'destructive',
      });
    } finally {
      setSavingFile(false);
    }
  }, [directory.currentPath, fetchDirectory, onFileContextChange, openFile, toast]);

  useEffect(() => {
    fetchDirectory('');
  }, [fetchDirectory]);

  useEffect(() => {
    if (!externalFileUpdate || externalFileUpdate.token === lastExternalToken) {
      return;
    }
    if (!openFile || externalFileUpdate.path !== openFile.path) {
      setLastExternalToken(externalFileUpdate.token);
      return;
    }

    const nextFile: OpsWorkspaceFileContext = {
      path: externalFileUpdate.path,
      content: externalFileUpdate.content,
      modifiedAt: externalFileUpdate.modifiedAt,
      dirty: false,
    };
    setOpenFile(nextFile);
    setOpenFileSize(externalFileUpdate.content.length);
    setLastExternalToken(externalFileUpdate.token);
    onFileContextChange?.(nextFile);
  }, [externalFileUpdate, lastExternalToken, onFileContextChange, openFile]);

  useEffect(() => {
    if (
      !requestedFilePath
      || requestedFileToken == null
      || requestedFileToken === lastRequestedFileToken
    ) {
      return;
    }

    setLastRequestedFileToken(requestedFileToken);
    void openWorkspaceFile(requestedFilePath);
  }, [lastRequestedFileToken, openWorkspaceFile, requestedFilePath, requestedFileToken]);

  const filteredEntries = useMemo(() => {
    if (!searchQuery.trim()) {
      return directory.entries;
    }
    const query = searchQuery.trim().toLowerCase();
    return directory.entries.filter((entry) =>
      entry.name.toLowerCase().includes(query) || entry.path.toLowerCase().includes(query),
    );
  }, [directory.entries, searchQuery]);

  const navigateToPath = (nextPath: string) => {
    fetchDirectory(nextPath);
  };

  const navigateUp = () => {
    const crumbs = directory.breadcrumbs.slice(0, -1);
    fetchDirectory(crumbs.join('/'));
  };

  const handleEditorChange = (value: string | undefined) => {
    if (!openFile) return;
    const nextFile: OpsWorkspaceFileContext = {
      ...openFile,
      content: value ?? '',
      dirty: true,
    };
    setOpenFile(nextFile);
    setOpenFileSize((value ?? '').length);
    onFileContextChange?.(nextFile);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Current Folder</p>
            <p className="text-lg font-semibold text-white truncate">{directory.currentPath || '/'}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Visible Entries</p>
            <p className="text-lg font-semibold text-white">{filteredEntries.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Selected File</p>
            <p className="text-sm font-medium text-white truncate">{openFile?.path || 'None'}</p>
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <p className="text-sm text-slate-400">Editor Status</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={openFile?.dirty ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}>
                {openFile?.dirty ? 'Unsaved changes' : 'In sync'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[360px_minmax(0,1fr)] gap-6">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-white">Workspace Browser</CardTitle>
                <CardDescription className="text-slate-400">
                  Browse the live repository mounted for Ops Hub.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchDirectory(directory.currentPath)}
                className="border-slate-600"
              >
                <RefreshCw className={`w-4 h-4 ${loadingDirectory ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-1 text-sm text-slate-400">
              <button
                onClick={() => navigateToPath('')}
                className="text-cyan-300 hover:text-cyan-200"
              >
                /
              </button>
              {directory.breadcrumbs.map((crumb, index) => {
                const nextPath = directory.breadcrumbs.slice(0, index + 1).join('/');
                return (
                  <React.Fragment key={nextPath}>
                    <ChevronRight className="w-3 h-3" />
                    <button
                      onClick={() => navigateToPath(nextPath)}
                      className="text-cyan-300 hover:text-cyan-200"
                    >
                      {crumb}
                    </button>
                  </React.Fragment>
                );
              })}
              {directory.currentPath && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={navigateUp}
                  className="ml-auto text-slate-300"
                >
                  <FolderUp className="w-4 h-4 mr-1" />
                  Up
                </Button>
              )}
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                placeholder="Filter entries..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-10 bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>

            <div className="border border-slate-700 rounded-xl overflow-hidden">
              <div className="max-h-[720px] overflow-y-auto">
                {loadingDirectory ? (
                  <div className="px-4 py-10 text-center text-slate-400">Loading workspace...</div>
                ) : filteredEntries.length === 0 ? (
                  <div className="px-4 py-10 text-center text-slate-400">No files matched the current filter.</div>
                ) : (
                  filteredEntries.map((entry) => (
                    <button
                      key={entry.path}
                      onClick={() => entry.type === 'directory' ? navigateToPath(entry.path) : openWorkspaceFile(entry.path)}
                      className={`w-full px-4 py-3 border-b border-slate-700/70 text-left transition hover:bg-slate-700/50 ${
                        openFile?.path === entry.path ? 'bg-cyan-500/10' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {getEntryIcon(entry)}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium text-white truncate">{entry.name}</div>
                          <div className="text-xs text-slate-400 truncate">
                            {entry.type === 'directory' ? entry.path || '/' : `${formatFileSize(entry.size)} • ${formatDate(entry.modifiedAt)}`}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-white">Live Editor</CardTitle>
                <CardDescription className="text-slate-400">
                  Open a file, edit it directly, or let the coding agent patch the selected file.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-slate-600 text-slate-300">
                  {openFile ? inferLanguage(openFile.path) : 'No file'}
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openFile && openWorkspaceFile(openFile.path)}
                  disabled={!openFile || loadingFile}
                  className="border-slate-600"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${loadingFile ? 'animate-spin' : ''}`} />
                  Reload
                </Button>
                <Button
                  size="sm"
                  onClick={saveWorkspaceFile}
                  disabled={!openFile || savingFile || !openFile.dirty}
                >
                  <Save className={`w-4 h-4 mr-2 ${savingFile ? 'animate-pulse' : ''}`} />
                  Save
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {!openFile ? (
              <div className="min-h-[720px] rounded-xl border border-dashed border-slate-700 flex flex-col items-center justify-center text-center px-6">
                <PencilLine className="w-10 h-10 text-slate-500 mb-4" />
                <p className="text-white font-medium">Open a workspace file to start editing.</p>
                <p className="text-sm text-slate-400 mt-2 max-w-md">
                  The coding agent uses the currently open file as its edit target when you run a `Simple Edit` command.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <Badge className="bg-slate-700 text-slate-200">{openFile.path}</Badge>
                  <span className="inline-flex items-center gap-1">
                    <FileText className="w-3.5 h-3.5" />
                    {formatFileSize(openFileSize)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock3 className="w-3.5 h-3.5" />
                    {formatDate(openFile.modifiedAt)}
                  </span>
                </div>

                <div className="border border-slate-700 rounded-xl overflow-hidden">
                  <Editor
                    height="680px"
                    language={inferLanguage(openFile.path)}
                    value={openFile.content}
                    onChange={handleEditorChange}
                    theme="vs-dark"
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                    }}
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
