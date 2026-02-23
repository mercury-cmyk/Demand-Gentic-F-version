import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FolderOpen,
  File,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Download,
  Trash2,
  Upload,
  RefreshCw,
  Search,
  ChevronRight,
  HardDrive,
  FolderUp,
  ArrowUp,
  Clock,
  Database,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface GCSFile {
  name: string;
  size: number;
  contentType: string;
  updated: string;
  isFolder: boolean;
}

interface BucketInfo {
  name: string;
  location: string;
  storageClass: string;
  totalFiles: number;
  totalSize: number;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getFileIcon(contentType: string, isFolder: boolean) {
  if (isFolder) return <FolderOpen className="w-4 h-4 text-yellow-400" />;
  if (contentType?.startsWith('audio/')) return <FileAudio className="w-4 h-4 text-purple-400" />;
  if (contentType?.startsWith('image/')) return <FileImage className="w-4 h-4 text-green-400" />;
  if (contentType?.startsWith('video/')) return <FileVideo className="w-4 h-4 text-blue-400" />;
  if (contentType?.startsWith('text/') || contentType?.includes('json') || contentType?.includes('csv'))
    return <FileText className="w-4 h-4 text-orange-400" />;
  return <File className="w-4 h-4 text-slate-400" />;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(d);
}

export default function FileManagerTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<GCSFile[]>([]);
  const [currentPrefix, setCurrentPrefix] = useState('');
  const [breadcrumbs, setBreadcrumbs] = useState<string[]>([]);
  const [bucketInfo, setBucketInfo] = useState<BucketInfo | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [uploading, setUploading] = useState(false);

  const fetchFiles = useCallback(async (prefix: string = '') => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (prefix) params.set('prefix', prefix);
      const res = await fetch(`/api/ops/files?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setFiles(data.files || []);
        setBucketInfo(data.bucket || null);
      } else {
        toast({ title: 'Error', description: 'Failed to list files', variant: 'destructive' });
      }
    } catch (err) {
      console.error('Failed to fetch files:', err);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchFiles(currentPrefix);
  }, [currentPrefix, fetchFiles]);

  const navigateToFolder = (folderName: string) => {
    const newPrefix = currentPrefix + folderName;
    setCurrentPrefix(newPrefix);
    setBreadcrumbs(newPrefix.split('/').filter(Boolean));
  };

  const navigateUp = () => {
    const parts = currentPrefix.split('/').filter(Boolean);
    parts.pop();
    const newPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
    setCurrentPrefix(newPrefix);
    setBreadcrumbs(newPrefix.split('/').filter(Boolean));
  };

  const navigateToBreadcrumb = (index: number) => {
    const parts = breadcrumbs.slice(0, index + 1);
    const newPrefix = parts.join('/') + '/';
    setCurrentPrefix(newPrefix);
    setBreadcrumbs(parts);
  };

  const handleDownload = async (fileName: string) => {
    try {
      const res = await fetch(`/api/ops/files/download?key=${encodeURIComponent(fileName)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.url) {
          window.open(data.url, '_blank');
        }
      } else {
        toast({ title: 'Error', description: 'Failed to get download URL', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error', description: String(err), variant: 'destructive' });
    }
  };

  const handleDelete = async (fileName: string) => {
    if (!confirm(`Delete "${fileName}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/ops/files?key=${encodeURIComponent(fileName)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast({ title: 'Deleted', description: `${fileName} deleted` });
        fetchFiles(currentPrefix);
      } else {
        toast({ title: 'Error', description: 'Failed to delete', variant: 'destructive' });
      }
    } catch (err) {
      toast({ title: 'Error', description: String(err), variant: 'destructive' });
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Get presigned upload URL
      const res = await fetch('/api/ops/files/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: currentPrefix + file.name,
          contentType: file.type || 'application/octet-stream',
        }),
      });
      if (!res.ok) throw new Error('Failed to get upload URL');
      const data = await res.json();

      // Upload directly to GCS
      await fetch(data.url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      });

      toast({ title: 'Uploaded', description: `${file.name} uploaded successfully` });
      fetchFiles(currentPrefix);
    } catch (err) {
      toast({ title: 'Upload failed', description: String(err), variant: 'destructive' });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const filteredFiles = searchQuery
    ? files.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()))
    : files;

  return (
    <div className="space-y-6">
      {/* Bucket Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Bucket</p>
                <p className="text-lg font-bold text-white truncate">{bucketInfo?.name || '—'}</p>
              </div>
              <div className="p-3 bg-blue-500/10 rounded-lg">
                <Database className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Location</p>
                <p className="text-lg font-bold text-white">{bucketInfo?.location || '—'}</p>
              </div>
              <div className="p-3 bg-green-500/10 rounded-lg">
                <HardDrive className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Files Listed</p>
                <p className="text-lg font-bold text-white">{files.length}</p>
              </div>
              <div className="p-3 bg-purple-500/10 rounded-lg">
                <File className="w-6 h-6 text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Storage Class</p>
                <p className="text-lg font-bold text-white">{bucketInfo?.storageClass || '—'}</p>
              </div>
              <div className="p-3 bg-yellow-500/10 rounded-lg">
                <Clock className="w-6 h-6 text-yellow-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* File Browser */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-white">Cloud Storage Browser</CardTitle>
            <CardDescription className="text-slate-400">
              Browse, upload, and manage files in your GCS bucket
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <label>
              <input
                type="file"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
              <Button variant="outline" size="sm" className="border-slate-600 cursor-pointer" asChild>
                <span>
                  {uploading ? <RefreshCw className="w-4 h-4 animate-spin mr-2" /> : <Upload className="w-4 h-4 mr-2" />}
                  Upload
                </span>
              </Button>
            </label>
            <Button variant="outline" size="sm" onClick={() => fetchFiles(currentPrefix)} className="border-slate-600">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-1 mb-4 text-sm">
            <button
              onClick={() => { setCurrentPrefix(''); setBreadcrumbs([]); }}
              className="text-blue-400 hover:text-blue-300 font-medium"
            >
              /
            </button>
            {breadcrumbs.map((crumb, i) => (
              <React.Fragment key={i}>
                <ChevronRight className="w-3 h-3 text-slate-500" />
                <button
                  onClick={() => navigateToBreadcrumb(i)}
                  className="text-blue-400 hover:text-blue-300"
                >
                  {crumb}
                </button>
              </React.Fragment>
            ))}
            {currentPrefix && (
              <Button variant="ghost" size="sm" onClick={navigateUp} className="ml-2 h-6">
                <FolderUp className="w-3 h-3 mr-1" />
                Up
              </Button>
            )}
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Filter files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
            />
          </div>

          {/* File Table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{searchQuery ? 'No files match your filter' : 'This folder is empty'}</p>
            </div>
          ) : (
            <div className="border border-slate-700 rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700 hover:bg-transparent">
                    <TableHead className="text-slate-400">Name</TableHead>
                    <TableHead className="text-slate-400 w-28">Size</TableHead>
                    <TableHead className="text-slate-400 w-40">Type</TableHead>
                    <TableHead className="text-slate-400 w-44">Modified</TableHead>
                    <TableHead className="text-slate-400 w-24 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredFiles.map((file) => {
                    const displayName = file.name.replace(currentPrefix, '');
                    return (
                      <TableRow key={file.name} className="border-slate-700 hover:bg-slate-700/50">
                        <TableCell>
                          <button
                            onClick={() => file.isFolder ? navigateToFolder(displayName) : undefined}
                            className={`flex items-center gap-2 ${file.isFolder ? 'text-blue-400 hover:text-blue-300 cursor-pointer' : 'text-white cursor-default'}`}
                          >
                            {getFileIcon(file.contentType, file.isFolder)}
                            <span className="truncate max-w-[300px]">{displayName}</span>
                          </button>
                        </TableCell>
                        <TableCell className="text-slate-300 text-sm">
                          {file.isFolder ? '—' : formatFileSize(file.size)}
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm truncate">
                          {file.isFolder ? 'Folder' : (file.contentType || 'unknown')}
                        </TableCell>
                        <TableCell className="text-slate-400 text-sm">
                          {formatDate(file.updated)}
                        </TableCell>
                        <TableCell className="text-right">
                          {!file.isFolder && (
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDownload(file.name)}
                                className="h-7 w-7 p-0"
                              >
                                <Download className="w-3.5 h-3.5 text-slate-400 hover:text-white" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(file.name)}
                                className="h-7 w-7 p-0"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-400" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
