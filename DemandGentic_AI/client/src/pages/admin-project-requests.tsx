import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  FolderKanban,
  Building2,
  Calendar,
  DollarSign,
  Target,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Eye,
  Sparkles,
  FileText,
  Globe,
  Phone,
  Mail,
  Zap,
  ChevronRight,
  ExternalLink,
  Rocket,
  AlertCircle,
  Trash2,
  Pencil,
} from 'lucide-react';

interface ProjectRequest {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'pending' | 'active' | 'paused' | 'completed' | 'archived' | 'rejected';
  clientAccountId: string;
  clientName: string;
  budgetAmount: string | null;
  requestedLeadCount: number | null;
  landingPageUrl: string | null;
  projectFileUrl: string | null;
  intakeRequestId?: string | null;
  projectType?: string | null;
  createdAt: string;
  updatedAt: string;
  approvalNotes: string | null;
  // Event metadata (for Argyle event-sourced projects)
  externalEventId?: string | null;
  eventTitle?: string | null;
  eventCommunity?: string | null;
  eventType?: string | null;
  eventLocation?: string | null;
  eventDate?: string | null;
  eventSourceUrl?: string | null;
}

const statusConfig: Record = {
  draft: { label: 'Draft', color: 'bg-slate-100 text-slate-700', icon: FileText },
  pending: { label: 'Pending Review', color: 'bg-amber-100 text-amber-800', icon: Clock },
  active: { label: 'Active', color: 'bg-emerald-100 text-emerald-800', icon: CheckCircle2 },
  paused: { label: 'Paused', color: 'bg-blue-100 text-blue-800', icon: Clock },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-800', icon: CheckCircle2 },
  archived: { label: 'Archived', color: 'bg-gray-100 text-gray-600', icon: FileText },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-800', icon: XCircle },
};

export default function AdminProjectRequests() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [statusFilter, setStatusFilter] = useState('pending');
  const [selectedProject, setSelectedProject] = useState(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [autoCreateCampaign, setAutoCreateCampaign] = useState(true);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    budgetAmount: '',
    requestedLeadCount: '',
    landingPageUrl: '',
    status: '' as string,
    enabledFeatures: {
      emailCampaignTest: false,
      campaignQueueView: false,
      previewStudio: false,
      campaignCallTest: false,
      voiceSelection: false,
    },
  });

  // Fetch project requests
  const { data: projects, isLoading, refetch } = useQuery({
    queryKey: ['/api/admin/project-requests', statusFilter],
    queryFn: async () => {
      const response = await fetch(`/api/admin/project-requests?status=${statusFilter}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` },
      });
      if (!response.ok) throw new Error('Failed to fetch project requests');
      return response.json();
    },
  });

  // Approve project mutation
  const approveMutation = useMutation({
    mutationFn: async (data: {
      projectId: string;
      notes: string;
      autoCreateCampaign: boolean;
      campaignType: string;
    }) => {
      return apiRequest('POST', `/api/admin/project-requests/${data.projectId}/approve`, {
        notes: data.notes,
        autoCreateCampaign: data.autoCreateCampaign,
        campaignType: data.campaignType,
      });
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/project-requests'] });
      setShowApproveDialog(false);
      setSelectedProject(null);
      setApprovalNotes('');
      toast({
        title: 'Project Approved',
        description: variables.autoCreateCampaign
          ? 'Campaign created automatically and project is now active.'
          : 'Project has been approved and is now active.'
      });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to approve project', description: error.message, variant: 'destructive' });
    },
  });

  // Reject project mutation
  const rejectMutation = useMutation({
    mutationFn: async (data: { projectId: string; reason?: string }) => {
      const payload = data.reason ? { reason: data.reason } : {};
      return apiRequest('POST', `/api/admin/project-requests/${data.projectId}/reject`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/project-requests'] });
      setShowRejectDialog(false);
      setSelectedProject(null);
      setRejectionReason('');
      toast({ title: 'Project Rejected', description: 'The client will be notified.' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to reject project', description: error.message, variant: 'destructive' });
    },
  });

  // Delete project mutation
  const deleteMutation = useMutation({
    mutationFn: async (projectId: string) => {
      return apiRequest('DELETE', `/api/admin/project-requests/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/project-requests'] });
      setShowDeleteDialog(false);
      setSelectedProject(null);
      toast({ title: 'Project Deleted', description: 'The project has been permanently deleted.' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to delete project', description: error.message, variant: 'destructive' });
    },
  });

  // Edit project mutation
  const editMutation = useMutation({
    mutationFn: async (data: { projectId: string; updates: any }) => {
      return apiRequest('PATCH', `/api/admin/project-requests/${data.projectId}`, data.updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/project-requests'] });
      setShowEditDialog(false);
      setSelectedProject(null);
      toast({ title: 'Project Updated', description: 'The project has been updated successfully.' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update project', description: error.message, variant: 'destructive' });
    },
  });

  const handleApprove = () => {
    if (!selectedProject) return;
    approveMutation.mutate({
      projectId: selectedProject.id,
      notes: approvalNotes,
      autoCreateCampaign,
      // Use project's existing type set by client, fallback to lead_qualification
      campaignType: selectedProject.projectType || 'lead_qualification',
    });
  };

  const handleReject = () => {
    if (!selectedProject) return;
    const trimmedReason = rejectionReason.trim();
    rejectMutation.mutate({
      projectId: selectedProject.id,
      reason: trimmedReason.length > 0 ? trimmedReason : undefined,
    });
  };

  const handleDelete = () => {
    if (!selectedProject) return;
    deleteMutation.mutate(selectedProject.id);
  };

  const handleEdit = () => {
    if (!selectedProject) return;
    const updates: any = {};
    if (editForm.name.trim()) updates.name = editForm.name;
    if (editForm.description !== undefined) updates.description = editForm.description;
    if (editForm.budgetAmount.trim()) updates.budgetAmount = editForm.budgetAmount;
    if (editForm.requestedLeadCount.trim()) updates.requestedLeadCount = parseInt(editForm.requestedLeadCount);
    if (editForm.landingPageUrl !== undefined) updates.landingPageUrl = editForm.landingPageUrl;
    if (editForm.status) updates.status = editForm.status;
    updates.enabledFeatures = editForm.enabledFeatures;

    editMutation.mutate({
      projectId: selectedProject.id,
      updates,
    });
  };

  const openEditDialog = (project: ProjectRequest) => {
    const features = (project as any).enabledFeatures || {};
    setEditForm({
      name: project.name,
      description: project.description || '',
      budgetAmount: project.budgetAmount || '',
      requestedLeadCount: project.requestedLeadCount?.toString() || '',
      landingPageUrl: project.landingPageUrl || '',
      status: project.status,
      enabledFeatures: {
        emailCampaignTest: features.emailCampaignTest ?? false,
        campaignQueueView: features.campaignQueueView ?? false,
        previewStudio: features.previewStudio ?? false,
        campaignCallTest: features.campaignCallTest ?? false,
        voiceSelection: features.voiceSelection ?? false,
      },
    });
    setShowEditDialog(true);
  };

  const formatCurrency = (amount: string | null) => {
    if (!amount) return 'Not specified';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(parseFloat(amount));
  };

  const pendingCount = projects?.filter(p => p.status === 'pending').length || 0;

  return (
    
      {/* Header */}
      
        
          
            
              
                
              
              Admin
            
            Project Requests
            
              Review and approve client project requests. Approved projects can automatically create campaigns based on client specifications.
            
          
          
            {pendingCount > 0 && (
              
                Pending
                {pendingCount}
              
            )}
          
        
      

      {/* Stats Cards */}
      
        {[
          { label: 'Pending', value: projects?.filter(p => p.status === 'pending').length || 0, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Active', value: projects?.filter(p => p.status === 'active').length || 0, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Completed', value: projects?.filter(p => p.status === 'completed').length || 0, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Rejected', value: projects?.filter(p => p.status === 'rejected').length || 0, color: 'text-red-600', bg: 'bg-red-50' },
        ].map((stat) => (
          
            
              
                
                  {stat.label}
                  {stat.value}
                
                
                  
                
              
            
          
        ))}
      

      {/* Filters */}
      
        
          
            Status Filter:
            
              {['all', 'pending', 'active', 'completed', 'rejected'].map((status) => (
                 setStatusFilter(status)}
                  className="capitalize"
                >
                  {status === 'all' ? 'All' : status}
                
              ))}
            
          
        
      

      {/* Project List */}
      
        {/* Project Cards */}
        
          {isLoading ? (
            
              
                
              
            
          ) : projects?.length === 0 ? (
            
              
                
                No project requests
                
                  {statusFilter === 'pending'
                    ? 'No pending project requests at this time.'
                    : `No ${statusFilter} projects found.`}
                
              
            
          ) : (
            
              {projects?.map((project) => {
                const statusInfo = statusConfig[project.status] || statusConfig.draft;
                const StatusIcon = statusInfo.icon;

                return (
                   setSelectedProject(project)}
                  >
                    
                      
                        
                          
                            {project.name}
                            
                              
                              {statusInfo.label}
                            
                          

                          
                            
                            {project.clientName}
                            •
                            
                            {new Date(project.createdAt).toLocaleDateString()}
                          

                          {project.description && (
                            
                              {project.description}
                            
                          )}

                          
                            {project.budgetAmount && (
                              
                                
                                {formatCurrency(project.budgetAmount)}
                              
                            )}
                            {project.requestedLeadCount && (
                              
                                
                                {project.requestedLeadCount} leads
                              
                            )}
                            {project.landingPageUrl && (
                              
                                
                                Has landing page
                              
                            )}
                            {project.externalEventId && (
                              
                                
                                Event-sourced
                              
                            )}
                          
                        

                        
                      
                    
                  
                );
              })}
            
          )}
        

        {/* Detail Panel */}
        
          {selectedProject ? (
            
              
                {selectedProject.name}
                Project Details
              
              
                
                  
                    Client
                    {selectedProject.clientName}
                  
                  
                  
                    Budget
                    {formatCurrency(selectedProject.budgetAmount)}
                  
                  
                  
                    Requested Leads
                    {selectedProject.requestedLeadCount || 'Not specified'}
                  
                  
                  
                    Submitted
                    {new Date(selectedProject.createdAt).toLocaleDateString()}
                  
                

                {selectedProject.description && (
                  
                    Description
                    {selectedProject.description}
                  
                )}

                {/* Project Attachments Section */}
                {(selectedProject.landingPageUrl || selectedProject.projectFileUrl) && (
                  
                    
                      
                      Project Attachments
                    
                    
                      {selectedProject.landingPageUrl && (
                        
                          
                            
                          
                          
                            Landing Page
                            
                              {selectedProject.landingPageUrl}
                            
                          
                          
                        
                      )}
                      {selectedProject.projectFileUrl && (
                        
                          
                            
                          
                          
                            Project Brief / Assets
                            
                              {selectedProject.projectFileUrl.split('/').pop() || 'Download file'}
                            
                          
                          
                        
                      )}
                    
                    
                      These attachments will be linked to the campaign when approved.
                    
                  
                )}

                {/* Event Source Section (Argyle event-sourced projects) */}
                {selectedProject.externalEventId && (
                  
                    
                      
                      Source Event
                    
                    
                      {selectedProject.eventTitle && (
                        
                          Event:{' '}
                          {selectedProject.eventTitle}
                        
                      )}
                      {selectedProject.eventCommunity && (
                        
                          Community:{' '}
                          {selectedProject.eventCommunity}
                        
                      )}
                      {selectedProject.eventDate && (
                        
                          Date:{' '}
                          {selectedProject.eventDate}
                        
                      )}
                      {selectedProject.eventLocation && (
                        
                          Location:{' '}
                          {selectedProject.eventLocation}
                        
                      )}
                      {selectedProject.eventSourceUrl && (
                        
                          
                          View source event
                        
                      )}
                    
                  
                )}

                {/* Action Buttons */}
                {selectedProject.status === 'pending' && (
                  
                     setShowApproveDialog(true)}
                    >
                      
                      Approve
                    
                     setShowRejectDialog(true)}
                    >
                      
                      Reject
                    
                  
                )}

                {selectedProject.status === 'active' && (
                  
                     setLocation(`/campaigns?projectId=${selectedProject.id}`)}
                    >
                      
                      View Campaigns
                    
                    
                        setLocation(
                          selectedProject.projectType === 'email_campaign'
                            ? `/email-campaigns/create?clientId=${selectedProject.clientAccountId}&projectId=${selectedProject.id}`
                            : `/campaigns/create?clientId=${selectedProject.clientAccountId}&projectId=${selectedProject.id}`
                        )
                      }
                    >
                      
                      {selectedProject.projectType === 'email_campaign' ? 'Open Email Setup' : 'Create Campaign'}
                    
                  
                )}

                {/* Edit and Delete buttons - always visible */}
                
                   openEditDialog(selectedProject)}
                  >
                    
                    Edit
                  
                   setShowDeleteDialog(true)}
                  >
                    
                    Delete
                  
                
              
            
          ) : (
            
              
                
                
                  Select a project to view details and take action
                
              
            
          )}
        
      

      {/* Approve Dialog */}
       {
          setShowApproveDialog(open);
          if (!open) {
            setApprovalNotes('');
          }
        }}
      >
        
          
            
              
              Approve Project
            
            
              Approve this project and optionally auto-create a campaign based on the client's requirements.
            
          

          
            
              
                
                
                  Agentic Campaign Creation
                  
                    The system will automatically create a campaign with AI-configured settings based on the project details.
                  
                
              
            

            {/* Project Attachments to Transfer */}
            {selectedProject && (selectedProject.landingPageUrl || selectedProject.projectFileUrl) && (
              
                
                  
                  
                    Attachments to Apply
                    
                      These project attachments will be linked to the new campaign:
                    
                    
                      {selectedProject.landingPageUrl && (
                        
                          
                          {selectedProject.landingPageUrl}
                        
                      )}
                      {selectedProject.projectFileUrl && (
                        
                          
                          {selectedProject.projectFileUrl.split('/').pop() || 'Project file'}
                        
                      )}
                    
                  
                
              
            )}

            
               setAutoCreateCampaign(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              
                Automatically create campaign on approval
              
            

            {autoCreateCampaign && selectedProject?.projectType && (
              
                
                  
                  
                    Campaign Type: {selectedProject.projectType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                  
                
                
                  Set by client during project creation. All project materials will be applied to the campaign.
                
              
            )}

            
              Approval Notes (optional)
               setApprovalNotes(e.target.value)}
                placeholder="Add any notes about this approval..."
                rows={3}
              />
            
          

          
             setShowApproveDialog(false)}>
              Cancel
            
            
              {approveMutation.isPending ? (
                
              ) : (
                
              )}
              Approve & {autoCreateCampaign ? 'Create Campaign' : 'Activate'}
            
          
        
      

      {/* Reject Dialog */}
      
        
          
            
              
              Reject Project
            
            
              Optionally provide a reason for rejecting this project. The client will be notified.
            
          

          
            
              Rejection Reason (optional)
               setRejectionReason(e.target.value)}
                placeholder="Share context for revision (optional)..."
                rows={4}
              />
            
          

          
             setShowRejectDialog(false)}>
              Cancel
            
            
              {rejectMutation.isPending ? (
                
              ) : (
                
              )}
              Reject Project
            
          
        
      

      {/* Delete Dialog */}
      
        
          
            
              
              Delete Project
            
            
              Are you sure you want to permanently delete this project? This action cannot be undone.
            
          

          
            {selectedProject && (
              
                {selectedProject.name}
                
                  Client: {selectedProject.clientName}
                
              
            )}
          

          
             setShowDeleteDialog(false)}>
              Cancel
            
            
              {deleteMutation.isPending ? (
                
              ) : (
                
              )}
              Delete Project
            
          
        
      

      {/* Edit Dialog */}
      
        
          
            
              
              Edit Project
            
            
              Update the project details.
            
          

          
            
              Project Name
               setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Project name"
              />
            

            
              Description
               setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Project description..."
                rows={3}
              />
            

            
              
                Budget Amount
                 setEditForm({ ...editForm, budgetAmount: e.target.value })}
                  placeholder="e.g., 5000"
                  type="number"
                />
              

              
                Requested Leads
                 setEditForm({ ...editForm, requestedLeadCount: e.target.value })}
                  placeholder="e.g., 100"
                  type="number"
                />
              
            

            
              Landing Page URL
               setEditForm({ ...editForm, landingPageUrl: e.target.value })}
                placeholder="https://..."
                type="url"
              />
            

            
              Status
               setEditForm({ ...editForm, status: value })}>
                
                  
                
                
                  Draft
                  Pending
                  Active
                  Paused
                  Completed
                  Archived
                  Rejected
                
              
            

            

            
              Client-Facing Features
              Toggle which features are available to the client for this project's campaigns.
              {[
                { key: 'emailCampaignTest' as const, label: 'Email Campaign Test' },
                { key: 'campaignQueueView' as const, label: 'Campaign Queue View' },
                { key: 'previewStudio' as const, label: 'Preview Studio' },
                { key: 'campaignCallTest' as const, label: 'Campaign Call Test' },
                { key: 'voiceSelection' as const, label: 'Voice Selection' },
              ].map(({ key, label }) => (
                
                  {label}
                  
                      setEditForm({
                        ...editForm,
                        enabledFeatures: { ...editForm.enabledFeatures, [key]: checked },
                      })
                    }
                  />
                
              ))}
            
          

          
             setShowEditDialog(false)}>
              Cancel
            
            
              {editMutation.isPending ? (
                
              ) : (
                
              )}
              Save Changes
            
          
        
      
    
  );
}