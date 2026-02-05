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
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Clock }> = {
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
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [selectedProject, setSelectedProject] = useState<ProjectRequest | null>(null);
  const [showApproveDialog, setShowApproveDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [approvalNotes, setApprovalNotes] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [campaignType, setCampaignType] = useState('lead_qualification');
  const [autoCreateCampaign, setAutoCreateCampaign] = useState(true);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    budgetAmount: '',
    requestedLeadCount: '',
    landingPageUrl: '',
    status: '' as string,
  });

  // Fetch project requests
  const { data: projects, isLoading, refetch } = useQuery<ProjectRequest[]>({
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
    mutationFn: async (data: { projectId: string; reason: string }) => {
      return apiRequest('POST', `/api/admin/project-requests/${data.projectId}/reject`, {
        reason: data.reason,
      });
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
      campaignType,
    });
  };

  const handleReject = () => {
    if (!selectedProject) return;
    rejectMutation.mutate({
      projectId: selectedProject.id,
      reason: rejectionReason,
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

    editMutation.mutate({
      projectId: selectedProject.id,
      updates,
    });
  };

  const openEditDialog = (project: ProjectRequest) => {
    setEditForm({
      name: project.name,
      description: project.description || '',
      budgetAmount: project.budgetAmount || '',
      requestedLeadCount: project.requestedLeadCount?.toString() || '',
      landingPageUrl: project.landingPageUrl || '',
      status: project.status,
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
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600 text-white p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-white/20 rounded-xl">
                <FolderKanban className="h-6 w-6" />
              </div>
              <p className="text-sm uppercase tracking-wide text-white/80">Admin</p>
            </div>
            <h1 className="text-3xl font-semibold">Project Requests</h1>
            <p className="text-white/80 mt-2 max-w-2xl">
              Review and approve client project requests. Approved projects can automatically create campaigns based on client specifications.
            </p>
          </div>
          <div className="flex items-center gap-4">
            {pendingCount > 0 && (
              <div className="rounded-xl bg-white/20 border border-white/20 px-4 py-2">
                <p className="text-xs text-white/80">Pending</p>
                <p className="text-2xl font-semibold">{pendingCount}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Pending', value: projects?.filter(p => p.status === 'pending').length || 0, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Active', value: projects?.filter(p => p.status === 'active').length || 0, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Completed', value: projects?.filter(p => p.status === 'completed').length || 0, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Rejected', value: projects?.filter(p => p.status === 'rejected').length || 0, color: 'text-red-600', bg: 'bg-red-50' },
        ].map((stat) => (
          <Card key={stat.label} className="border-0 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                  <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                </div>
                <div className={`p-3 rounded-xl ${stat.bg}`}>
                  <Target className={`h-5 w-5 ${stat.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <Label className="text-sm font-medium">Status Filter:</Label>
            <div className="flex gap-2">
              {['all', 'pending', 'active', 'completed', 'rejected'].map((status) => (
                <Button
                  key={status}
                  variant={statusFilter === status ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter(status)}
                  className="capitalize"
                >
                  {status === 'all' ? 'All' : status}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Project List */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Project Cards */}
        <div className="lg:col-span-2">
          {isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ) : projects?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FolderKanban className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No project requests</h3>
                <p className="text-muted-foreground text-center">
                  {statusFilter === 'pending'
                    ? 'No pending project requests at this time.'
                    : `No ${statusFilter} projects found.`}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {projects?.map((project) => {
                const statusInfo = statusConfig[project.status] || statusConfig.draft;
                const StatusIcon = statusInfo.icon;

                return (
                  <Card
                    key={project.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      selectedProject?.id === project.id ? 'ring-2 ring-primary' : ''
                    }`}
                    onClick={() => setSelectedProject(project)}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{project.name}</h3>
                            <Badge className={statusInfo.color}>
                              <StatusIcon className="h-3 w-3 mr-1" />
                              {statusInfo.label}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                            <Building2 className="h-4 w-4" />
                            <span>{project.clientName}</span>
                            <span className="text-muted-foreground/50">•</span>
                            <Calendar className="h-4 w-4" />
                            <span>{new Date(project.createdAt).toLocaleDateString()}</span>
                          </div>

                          {project.description && (
                            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                              {project.description}
                            </p>
                          )}

                          <div className="flex items-center gap-4 text-sm">
                            {project.budgetAmount && (
                              <div className="flex items-center gap-1">
                                <DollarSign className="h-4 w-4 text-emerald-600" />
                                <span className="font-medium">{formatCurrency(project.budgetAmount)}</span>
                              </div>
                            )}
                            {project.requestedLeadCount && (
                              <div className="flex items-center gap-1">
                                <Users className="h-4 w-4 text-blue-600" />
                                <span className="font-medium">{project.requestedLeadCount} leads</span>
                              </div>
                            )}
                            {project.landingPageUrl && (
                              <div className="flex items-center gap-1 text-muted-foreground">
                                <Globe className="h-4 w-4" />
                                <span>Has landing page</span>
                              </div>
                            )}
                          </div>
                        </div>

                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="lg:col-span-1">
          {selectedProject ? (
            <Card className="sticky top-4">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">{selectedProject.name}</CardTitle>
                <CardDescription>Project Details</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Client</span>
                    <span className="font-medium">{selectedProject.clientName}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Budget</span>
                    <span className="font-medium">{formatCurrency(selectedProject.budgetAmount)}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Requested Leads</span>
                    <span className="font-medium">{selectedProject.requestedLeadCount || 'Not specified'}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Submitted</span>
                    <span className="font-medium">{new Date(selectedProject.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {selectedProject.description && (
                  <div className="pt-2">
                    <p className="text-sm font-medium mb-1">Description</p>
                    <p className="text-sm text-muted-foreground">{selectedProject.description}</p>
                  </div>
                )}

                {/* Project Attachments Section */}
                {(selectedProject.landingPageUrl || selectedProject.projectFileUrl) && (
                  <div className="pt-4">
                    <p className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <FileText className="h-4 w-4 text-violet-600" />
                      Project Attachments
                    </p>
                    <div className="space-y-2 bg-slate-50 rounded-lg p-3 border">
                      {selectedProject.landingPageUrl && (
                        <a
                          href={selectedProject.landingPageUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-2 rounded-md hover:bg-white transition-colors group"
                        >
                          <div className="p-2 bg-blue-100 rounded-lg">
                            <Globe className="h-4 w-4 text-blue-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium group-hover:text-primary">Landing Page</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {selectedProject.landingPageUrl}
                            </p>
                          </div>
                          <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                        </a>
                      )}
                      {selectedProject.projectFileUrl && (
                        <a
                          href={selectedProject.projectFileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-2 rounded-md hover:bg-white transition-colors group"
                        >
                          <div className="p-2 bg-amber-100 rounded-lg">
                            <FileText className="h-4 w-4 text-amber-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium group-hover:text-primary">Project Brief / Assets</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {selectedProject.projectFileUrl.split('/').pop() || 'Download file'}
                            </p>
                          </div>
                          <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      These attachments will be linked to the campaign when approved.
                    </p>
                  </div>
                )}

                {/* Action Buttons */}
                {selectedProject.status === 'pending' && (
                  <div className="flex gap-2 pt-4">
                    <Button
                      className="flex-1 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700"
                      onClick={() => setShowApproveDialog(true)}
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Approve
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => setShowRejectDialog(true)}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Reject
                    </Button>
                  </div>
                )}

                {selectedProject.status === 'active' && (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => setLocation(`/campaigns?projectId=${selectedProject.id}`)}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    View Campaigns
                  </Button>
                )}

                {/* Edit and Delete buttons - always visible */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => openEditDialog(selectedProject)}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setShowDeleteDialog(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Eye className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground text-center">
                  Select a project to view details and take action
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Approve Dialog */}
      <Dialog
        open={showApproveDialog && !!selectedProject}
        onOpenChange={(open) => {
          setShowApproveDialog(open);
          if (!open) {
            setApprovalNotes('');
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" />
              Approve Project
            </DialogTitle>
            <DialogDescription>
              Approve this project and optionally auto-create a campaign based on the client's requirements.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
              <div className="flex items-start gap-3">
                <Zap className="h-5 w-5 text-emerald-600 mt-0.5" />
                <div>
                  <p className="font-medium text-emerald-900">Agentic Campaign Creation</p>
                  <p className="text-sm text-emerald-700 mt-1">
                    The system will automatically create a campaign with AI-configured settings based on the project details.
                  </p>
                </div>
              </div>
            </div>

            {/* Project Attachments to Transfer */}
            {selectedProject && (selectedProject.landingPageUrl || selectedProject.projectFileUrl) && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-blue-900">Attachments to Apply</p>
                    <p className="text-sm text-blue-700 mt-1 mb-2">
                      These project attachments will be linked to the new campaign:
                    </p>
                    <div className="space-y-1">
                      {selectedProject.landingPageUrl && (
                        <div className="flex items-center gap-2 text-sm text-blue-800">
                          <Globe className="h-3 w-3" />
                          <span className="truncate">{selectedProject.landingPageUrl}</span>
                        </div>
                      )}
                      {selectedProject.projectFileUrl && (
                        <div className="flex items-center gap-2 text-sm text-blue-800">
                          <FileText className="h-3 w-3" />
                          <span className="truncate">{selectedProject.projectFileUrl.split('/').pop() || 'Project file'}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="autoCreate"
                checked={autoCreateCampaign}
                onChange={(e) => setAutoCreateCampaign(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="autoCreate" className="text-sm">
                Automatically create campaign on approval
              </Label>
            </div>

            {autoCreateCampaign && (
              <div className="space-y-2">
                <Label>Campaign Type</Label>
                {selectedProject?.intakeRequestId ? (
                    <div className="text-sm text-gray-700 p-2 bg-gray-50 rounded border">
                        <strong>Auto-Detected from Request:</strong> {selectedProject.projectType || 'Custom'}
                        <p className="text-xs text-muted-foreground mt-1">
                            Use "Lead Qualification" if uncertain, otherwise the system uses the connected intake request type.
                        </p>
                    </div>
                ) : (
                <Select value={campaignType} onValueChange={setCampaignType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead_qualification">
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4" />
                        Lead Qualification
                      </div>
                    </SelectItem>
                    <SelectItem value="appointment_setting">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Appointment Setting
                      </div>
                    </SelectItem>
                    <SelectItem value="high_quality_leads">
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        High Quality Leads
                      </div>
                    </SelectItem>
                    <SelectItem value="email">
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        Email Campaign
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>Approval Notes (optional)</Label>
              <Textarea
                value={approvalNotes}
                onChange={(e) => setApprovalNotes(e.target.value)}
                placeholder="Add any notes about this approval..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={approveMutation.isPending}
              className="bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700"
            >
              {approveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Rocket className="h-4 w-4 mr-2" />
              )}
              Approve & {autoCreateCampaign ? 'Create Campaign' : 'Activate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              Reject Project
            </DialogTitle>
            <DialogDescription>
              Provide a reason for rejecting this project. The client will be notified.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Rejection Reason</Label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Please provide a reason for rejection..."
                rows={4}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectMutation.isPending || !rejectionReason.trim()}
            >
              {rejectMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Reject Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-red-600" />
              Delete Project
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete this project? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            {selectedProject && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                <p className="font-medium text-red-900">{selectedProject.name}</p>
                <p className="text-sm text-red-700 mt-1">
                  Client: {selectedProject.clientName}
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Delete Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-blue-600" />
              Edit Project
            </DialogTitle>
            <DialogDescription>
              Update the project details.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Project Name</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Project name"
              />
            </div>

            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea
                value={editForm.description}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Project description..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Budget Amount</Label>
                <Input
                  value={editForm.budgetAmount}
                  onChange={(e) => setEditForm({ ...editForm, budgetAmount: e.target.value })}
                  placeholder="e.g., 5000"
                  type="number"
                />
              </div>

              <div className="space-y-2">
                <Label>Requested Leads</Label>
                <Input
                  value={editForm.requestedLeadCount}
                  onChange={(e) => setEditForm({ ...editForm, requestedLeadCount: e.target.value })}
                  placeholder="e.g., 100"
                  type="number"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Landing Page URL</Label>
              <Input
                value={editForm.landingPageUrl}
                onChange={(e) => setEditForm({ ...editForm, landingPageUrl: e.target.value })}
                placeholder="https://..."
                type="url"
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(value) => setEditForm({ ...editForm, status: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleEdit}
              disabled={editMutation.isPending}
            >
              {editMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
