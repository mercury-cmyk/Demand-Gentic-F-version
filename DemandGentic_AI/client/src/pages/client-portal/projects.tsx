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

const statusColors: Record = {
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

  const { data: projects, isLoading } = useQuery({
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

  const handleFileUpload = async (e: React.ChangeEvent) => {
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
    
      
        {/* Header */}
        
          
            Projects
            
              Organize your campaigns into projects for better tracking
            
          
           setShowCreateDialog(true)}>
            
            New Project
          
        

        {/* Projects Grid */}
        {isLoading ? (
          
            
          
        ) : projects?.length === 0 ? (
          
            
              
              No projects yet
              
                Create your first project to organize your campaigns
              
               setShowCreateDialog(true)}>
                
                Create Project
              
            
          
        ) : (
          
            {projects?.map((project) => (
              
                
                  
                    
                      
                        {project.name}
                        {project.projectCode && (
                          
                            {project.projectCode}
                          
                        )}
                      
                      
                        {project.status}
                      
                    
                  
                  
                    {project.description && (
                      
                        {project.description}
                      
                    )}

                    
                      
                        
                        
                          {project.campaignCount} campaign
                          {project.campaignCount !== 1 ? 's' : ''}
                        
                      
                      
                        
                        {formatCurrency(project.totalCost)}
                      
                      {project.startDate && (
                        
                          
                          
                            {new Date(project.startDate).toLocaleDateString()}
                            {project.endDate && (
                              <> - {new Date(project.endDate).toLocaleDateString()}
                            )}
                          
                        
                      )}
                    

                    
                      View Details
                      
                    
                  
                
              
            ))}
          
        )}
      

      {/* Create Project Dialog */}
      
        
          
            Create New Project
          
          
            
              Project Name *
               setNewProject({ ...newProject, name: e.target.value })}
                placeholder="e.g., Q1 2025 Lead Generation"
              />
            
            
              Description
              
                  setNewProject({ ...newProject, description: e.target.value })
                }
                placeholder="Brief description of the project..."
                rows={3}
              />
            
            
              Budget (USD)
              
                  setNewProject({ ...newProject, budgetAmount: e.target.value })
                }
                placeholder="e.g., 50000"
              />
            

            
              Landing Page URL (Optional)
              
                
                
                    setNewProject({ ...newProject, landingPageUrl: e.target.value })
                  }
                  className="pl-9"
                  placeholder="https://example.com/landing-page"
                />
              
            

            
              Project File
              
                 document.getElementById('file-upload')?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    
                  ) : (
                    
                  )}
                  {newProject.fileName || 'Upload separation file or target list...'}
                
                
              
              {newProject.fileName && (
                
                  
                  File uploaded ready to submit
                
              )}
              
                Upload target accounts list, separation file, or other requirements.
              
            
          
          
             setShowCreateDialog(false)}>
              Cancel
            
            
              {createMutation.isPending && (
                
              )}
              Create Project
            
          
        
      
    
  );
}