import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ClientPortalLayout } from '@/components/client-portal/layout/client-portal-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  FolderKanban,
  Megaphone,
  DollarSign,
  Calendar,
  ChevronRight,
  Loader2,
  Upload,
  Link as LinkIcon,
  FileText
} from 'lucide-react';

interface Project {
  id: string;
  name: string;
  description: string | null;
  projectCode: string | null;
  status: 'draft' | 'active' | 'paused' | 'completed' | 'archived';
  startDate: string | null;
  endDate: string | null;
  budgetAmount: string | null;
  budgetCurrency: string | null;
  landingPageUrl: string | null;
  projectFileUrl: string | null;
  createdAt: string;
  campaignCount: number;
  totalCost: number;
}

const getToken = () => localStorage.getItem('clientPortalToken');

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
  completed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  archived: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

export default function ClientPortalProjects() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    budgetAmount: '',
    landingPageUrl: '',
    projectFileUrl: '',
    fileName: '', // For display only
  });

  const { data: projects, isLoading } = useQuery<Project[]>({
    queryKey: ['client-portal-projects'],
    queryFn: async () => {
      const res = await fetch('/api/client-portal/projects', {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error('Failed to fetch projects');
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: { 
      name: string; 
      description?: string; 
      budgetAmount?: number;
      landingPageUrl?: string;
      projectFileUrl?: string;
    }) => {
      const res = await fetch('/api/client-portal/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('Failed to create project');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-portal-projects'] });
      setShowCreateDialog(false);
      setNewProject({ 
        name: '', 
        description: '', 
        budgetAmount: '', 
        landingPageUrl: '', 
        projectFileUrl: '',
        fileName: '' 
      });
      toast({ title: 'Project created successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to create project', variant: 'destructive' });
    },
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // Get presigned URL
      const res = await fetch('/api/s3/upload-url', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getToken()}` 
        },
        body: JSON.stringify({ 
          filename: file.name, 
          contentType: file.type,
          folder: 'uploads' 
        }),
      });
      
      if (!res.ok) throw new Error('Failed to get upload URL');
      const { url, key } = await res.json();

      // Upload to S3
      const uploadRes = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });

      if (!uploadRes.ok) throw new Error('Failed to upload file');

      setNewProject(prev => ({ 
        ...prev, 
        projectFileUrl: key,
        fileName: file.name
      }));
      toast({ title: 'File uploaded successfully' });
    } catch (error) {
      console.error(error);
      toast({ title: 'Upload failed', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCreate = () => {
    if (!newProject.name.trim()) {
      toast({ title: 'Project name is required', variant: 'destructive' });
      return;
    }
    createMutation.mutate({
      name: newProject.name,
      description: newProject.description || undefined,
      budgetAmount: newProject.budgetAmount ? parseFloat(newProject.budgetAmount) : undefined,
      landingPageUrl: newProject.landingPageUrl || undefined,
      projectFileUrl: newProject.projectFileUrl || undefined,
    });
  };

  const formatCurrency = (amount: number, currency = 'USD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <ClientPortalLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Projects</h1>
            <p className="text-muted-foreground">
              Organize your campaigns into projects for better tracking
            </p>
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </div>

        {/* Projects Grid */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : projects?.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No projects yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create your first project to organize your campaigns
              </p>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Project
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects?.map((project) => (
              <Link key={project.id} href={`/client-portal/projects/${project.id}`}>
                <Card className="cursor-pointer hover:shadow-md transition-shadow h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="text-lg">{project.name}</CardTitle>
                        {project.projectCode && (
                          <CardDescription className="font-mono text-xs">
                            {project.projectCode}
                          </CardDescription>
                        )}
                      </div>
                      <Badge className={statusColors[project.status]}>
                        {project.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {project.description && (
                      <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                        {project.description}
                      </p>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <Megaphone className="h-4 w-4 text-muted-foreground" />
                        <span>
                          {project.campaignCount} campaign
                          {project.campaignCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                        <span>{formatCurrency(project.totalCost)}</span>
                      </div>
                      {project.startDate && (
                        <div className="flex items-center gap-2 col-span-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {new Date(project.startDate).toLocaleDateString()}
                            {project.endDate && (
                              <> - {new Date(project.endDate).toLocaleDateString()}</>
                            )}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-end mt-4 text-primary text-sm">
                      View Details
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Project Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                value={newProject.name}
                onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                placeholder="e.g., Q1 2025 Lead Generation"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={newProject.description}
                onChange={(e) =>
                  setNewProject({ ...newProject, description: e.target.value })
                }
                placeholder="Brief description of the project..."
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="budget">Budget (USD)</Label>
              <Input
                id="budget"
                type="number"
                value={newProject.budgetAmount}
                onChange={(e) =>
                  setNewProject({ ...newProject, budgetAmount: e.target.value })
                }
                placeholder="e.g., 50000"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="landingPage">Landing Page URL (Optional)</Label>
              <div className="relative">
                <LinkIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="landingPage"
                  value={newProject.landingPageUrl}
                  onChange={(e) =>
                    setNewProject({ ...newProject, landingPageUrl: e.target.value })
                  }
                  className="pl-9"
                  placeholder="https://example.com/landing-page"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="projectFile">Project File</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  className="w-full justify-start text-muted-foreground"
                  onClick={() => document.getElementById('file-upload')?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  {newProject.fileName || 'Upload separation file or target list...'}
                </Button>
                <Input
                  id="file-upload"
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  accept=".csv,.xlsx,.xls,.pdf,.txt,.doc,.docx"
                />
              </div>
              {newProject.fileName && (
                <p className="text-xs text-green-600 flex items-center mt-1">
                  <FileText className="h-3 w-3 mr-1" />
                  File uploaded ready to submit
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Upload target accounts list, separation file, or other requirements.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={createMutation.isPending || isUploading}>
              {createMutation.isPending && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ClientPortalLayout>
  );
}
